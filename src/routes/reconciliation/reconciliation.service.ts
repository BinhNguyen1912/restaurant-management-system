import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SYSTEM_TIME_ZONE } from '@/shared/config/timezone'
import { resolvePeriod } from '@/routes/reconciliation/reconciliation.period'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@/shared/service/prisma.service'
import { VnPayService } from '@/shared/service/vnpay.service'
import { CheckItem, classifyPayment, classifyVnpay, EntrySnapshot, summarizeItems } from '@/routes/reconciliation/reconciliation-check'
import { RunQueryType } from '@/routes/reconciliation/reconciliation.model'

/** tài khoản nhận tiền theo loại bút toán thu tiền */
const RECEIVING_ACCOUNT: Record<string, string> = {
  ORDER_PAID_CASH: 'CASH',
  ORDER_PAID_VNPAY: 'VNPAY_CLEARING',
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name)

  constructor(
    private readonly prismaService: PrismaService,
    private readonly vnpayService: VnPayService,
  ) {}

  /**
   * Chạy đối soát 1 kỳ: tạo run, phân loại từng payment, ghi items, đóng run.
   *
   * Run FAILED khi có lỗi — không bao giờ để run treo RUNNING rồi im lặng, vì người đọc
   * báo cáo sẽ tưởng "không có lệch".
   */
  async executeRun(query: RunQueryType) {
    const branchId = query.branchId ?? null
    const run = await this.prismaService.reconciliationRun.create({
      data: {
        periodFrom: new Date(`${query.fromDate}T00:00:00.000Z`),
        periodTo: new Date(`${query.toDate}T00:00:00.000Z`),
        branchId,
        status: 'RUNNING',
      },
    })

    try {
      const from = new Date(`${query.fromDate}T00:00:00.000+07:00`)
      const to = new Date(`${query.toDate}T23:59:59.999+07:00`)

      const payments = await this.prismaService.payment.findMany({
        where: {
          status: 'SUCCESS',
          paidAt: { gte: from, lte: to },
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true, amount: true, method: true, transactionId: true, branchId: true },
        orderBy: { id: 'asc' },
      })

      const entries = payments.length
        ? await this.prismaService.ledgerEntry.findMany({
            where: {
              refType: { in: ['ORDER_PAID_CASH', 'ORDER_PAID_VNPAY'] },
              refId: { in: payments.map((payment) => payment.id) },
            },
            select: {
              id: true,
              status: true,
              refType: true,
              refId: true,
              lines: { select: { direction: true, amount: true, account: { select: { code: true } } } },
            },
          })
        : []

      const entriesByPayment = new Map<number, EntrySnapshot[]>()
      for (const entry of entries) {
        const accountCode = RECEIVING_ACCOUNT[entry.refType]
        const receivedAmount = entry.lines
          .filter((line) => line.direction === 'DEBIT' && line.account.code === accountCode)
          .reduce((sum, line) => sum.add(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0))

        const list = entriesByPayment.get(entry.refId) ?? []
        list.push({
          id: entry.id,
          status: entry.status,
          refType: entry.refType,
          refId: entry.refId,
          receivedAmount,
        })
        entriesByPayment.set(entry.refId, list)
      }

      const items: CheckItem[] = payments.map((payment) =>
        classifyPayment(payment, entriesByPayment.get(payment.id) ?? []),
      )

      // ---- VNPay: so từng giao dịch qua querydr ----
      // Không gọi được (chưa có credential sandbox, không có intent) thì BỎ QUA và ghi lý do,
      // KHÔNG được coi là lệch — thà nói "chưa kiểm được" còn hơn báo sai.
      const vnpayPayments = payments.filter((payment) => payment.transactionId && payment.method === 'VNPAY')
      let vnpayChecked = 0
      let vnpaySkipped: string | null = null
      const maxQueries = 50

      for (const payment of vnpayPayments.slice(0, maxQueries)) {
        const reference = await this.resolveVnpayReference(payment.id)
        if (!reference) {
          vnpaySkipped = 'không tìm thấy PaymentIntent (mã giao dịch VNPay)'
          continue
        }
        try {
          const gateway = await this.vnpayService.queryTransaction(
            reference.reference,
            reference.createdAt.toISOString(),
          )
          if (!gateway) {
            vnpaySkipped = 'querydr không trả dữ liệu'
            continue
          }
          vnpayChecked += 1
          const item = classifyVnpay(payment, {
            status: String(gateway.vnp_TransactionStatus ?? ''),
            amount: Number(gateway.vnp_Amount ?? 0) / 100, // VNPay trả đơn vị xu
          })
          if (item) items.push(item)
        } catch (error: any) {
          // Không gọi được API (chưa cấu hình/sandbox) không phải lỗi đối soát nội bộ
          vnpaySkipped = `querydr lỗi: ${error?.message ?? error}`
        }
      }
      if (vnpayPayments.length > maxQueries) {
        vnpaySkipped = `chỉ tra ${maxQueries}/${vnpayPayments.length} giao dịch trong 1 lần chạy`
      }

      const summary = {
        ...summarizeItems(items),
        vnpay: { candidates: vnpayPayments.length, checked: vnpayChecked, skippedReason: vnpaySkipped },
      }

      if (items.length) {
        await this.prismaService.reconciliationItem.createMany({
          data: items.map((item) => ({
            runId: run.id,
            kind: item.kind,
            refType: item.refType,
            refId: item.refId,
            paymentId: item.paymentId,
            ledgerEntryId: item.ledgerEntryId,
            transactionId: item.transactionId,
            amountExpected: item.amountExpected,
            amountActual: item.amountActual,
            amountDelta: item.amountDelta,
            detail: (item.detail ?? {}) as Prisma.InputJsonValue,
          })),
        })
      }

      return await this.prismaService.reconciliationRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', finishedAt: new Date(), summary },
        include: { branch: { select: { code: true, name: true } } },
      })
    } catch (error: any) {
      await this.prismaService.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: String(error?.message ?? error).slice(0, 1000),
        },
      })
      throw error
    }
  }

  /**
   * VNPay querydr cần `vnp_TxnRef` (PaymentIntent.reference) chứ không phải transactionId,
   * và cần ngày tạo để ký request.
   */
  private async resolveVnpayReference(paymentId: number) {
    const orders = await this.prismaService.order.findMany({ where: { paymentId }, select: { id: true } })
    if (!orders.length) return null
    const intent = await this.prismaService.paymentIntent.findFirst({
      where: { provider: 'VNPAY', orderIds: { hasSome: orders.map((order) => order.id) } },
      select: { reference: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    return intent
  }

  /**
   * 02:30 giờ VN hằng ngày: đối soát HÔM QUA cho mọi chi nhánh đang hoạt động.
   * Log số item mỗi loại để người vận hành thấy ngay hôm đó có lệch hay không.
   */
  @Cron('0 30 2 * * *', { timeZone: SYSTEM_TIME_ZONE })
  async scheduledRun() {
    const period = resolvePeriod()
    const branches = await this.prismaService.branch.findMany({
      where: { isActive: true },
      select: { id: true, code: true },
    })

    for (const branch of branches) {
      try {
        const run = await this.executeRun({ ...period, branchId: branch.id })
        const summary = run.summary as { byKind?: Record<string, number> } | null
        this.logger.log(
          `đối soát ${period.fromDate} chi nhánh ${branch.code}: ${JSON.stringify(summary?.byKind ?? {})}`,
        )
      } catch (error: any) {
        // Một chi nhánh lỗi không được chặn chi nhánh khác; run đã được ghi FAILED kèm lý do
        this.logger.error(`đối soát chi nhánh ${branch.code} thất bại: ${error?.message ?? error}`)
      }
    }
  }

  async list(query: RunQueryType) {
    const where: Prisma.ReconciliationRunWhereInput = {}
    if (query.branchId) where.branchId = query.branchId
    if (query.fromDate) where.periodTo = { gte: new Date(`${query.fromDate}T00:00:00.000Z`) }
    if (query.toDate) where.periodFrom = { lte: new Date(`${query.toDate}T00:00:00.000Z`) }

    return this.prismaService.reconciliationRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: {
        branch: { select: { code: true, name: true } },
        _count: { select: { items: true } },
      },
    })
  }

  async detail(id: number) {
    const run = await this.prismaService.reconciliationRun.findUnique({
      where: { id },
      include: {
        branch: { select: { code: true, name: true } },
        items: { orderBy: [{ kind: 'asc' }, { id: 'asc' }] },
      },
    })
    if (!run) throw new NotFoundException(`Không tìm thấy lần đối soát #${id}`)
    return run
  }

  /** đánh dấu 1 sai lệch đã xử lý (giữ lại item làm dấu vết, không xoá) */
  async resolveItem(id: number, status: 'RESOLVED' | 'IGNORED') {
    const item = await this.prismaService.reconciliationItem.update({
      where: { id },
      data: { status },
    })
    return item
  }
}
