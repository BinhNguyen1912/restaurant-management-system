import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { LedgerPostingService } from '@/shared/service/ledger-posting.service'
import { cashShiftTotals, cashVariance, cashVarianceLines } from '@/shared/service/cash-shift-math'
import { resolveBranchId } from '@/shared/service/branch.resolver'
import { toMoneyNumbers } from '@/shared/service/money-serializer'
import { roleName } from '@/shared/constants/role.constant'
import { CashShiftRepo } from '@/routes/cash-shift/cash-shift.repo'
import {
  CashShiftHasUnpaidCashOrdersException,
  CashShiftAlreadyOpenException,
  CashShiftClosedException,
  CashShiftNotFoundException,
  CashShiftNotOwnedException,
} from '@/routes/cash-shift/cash-shift.error'
import {
  CashShiftDetailSchema,
  CashShiftListQueryType,
  CashShiftType,
  CloseCashShiftType,
  CreateCashMovementType,
  OpenCashShiftType,
} from '@/routes/cash-shift/cash-shift.model'

type Actor = { userId: number; roleName?: string }

@Injectable()
export class CashShiftService {
  constructor(
    private readonly repo: CashShiftRepo,
    private readonly prismaService: PrismaService,
    private readonly ledgerPosting: LedgerPostingService,
  ) {}

  /**
   * Mo ca: 1 ca dang mo / chi nhanh va 1 ca dang mo / nguoi.
   * Unique index (partial) trong DB la chot cuoi — 2 request song song chi 1 thang.
   */
  async open(actor: Actor, data: OpenCashShiftType): Promise<CashShiftType> {
    const branchId = await resolveBranchId(this.prismaService, { userId: actor.userId, roleName: actor.roleName })

    const [openInBranch, openOfStaff] = await Promise.all([
      this.repo.findOpenByBranch(branchId),
      this.repo.findOpenByStaff(actor.userId),
    ])
    if (openInBranch || openOfStaff) throw CashShiftAlreadyOpenException

    const shift = await this.repo.create({
      branchId,
      staffId: actor.userId,
      openingFloat: data.openingFloat,
      note: data.note,
    })
    return toMoneyNumbers<CashShiftType>(shift)
  }

  async current(actor: Actor) {
    const branchId = await resolveBranchId(this.prismaService, { userId: actor.userId, roleName: actor.roleName })
    const open = await this.repo.findOpenByBranch(branchId)
    if (!open) return null
    const shift = await this.repo.findById(open.id, branchId)
    if (!shift) return null
    return this.withLiveTotals(shift)
  }

  async detail(id: number, actor: Actor) {
    const branchId = await resolveBranchId(this.prismaService, { userId: actor.userId, roleName: actor.roleName })
    const shift = await this.repo.findById(id, branchId)
    if (!shift) throw CashShiftNotFoundException
    return this.withLiveTotals(shift)
  }

  async list(query: CashShiftListQueryType, actor: Actor) {
    const branchId = await resolveBranchId(this.prismaService, { userId: actor.userId, roleName: actor.roleName })
    const result = await this.repo.list(query, branchId)
    return toMoneyNumbers(result)
  }

  /**
   * Thu/chi tiền mặt trong ca đang mở — và **ghi bút toán sổ cái** cho khoản đó.
   *
   * Trước đây chỉ ghi bảng `CashMovement`: tiền vào/ra két KHÔNG vào sổ cái, nên Sổ quỹ / Sổ cái /
   * Báo cáo không phản ánh tiền mặt thực tế, và số két lệch với sổ mà không ai thấy.
   *
   * Bút toán đối ứng:
   *  - IN : Nợ CASH / Có OTHER_INCOME   (thu khác, không phải doanh thu bán hàng)
   *  - OUT: Nợ OTHER_EXPENSE / Có CASH
   * Chạy trong CÙNG transaction với việc tạo movement: không thể có chuyện "có phiếu thu mà sổ
   * không ghi" hoặc ngược lại.
   */
  async addMovement(id: number, actor: Actor, data: CreateCashMovementType) {
    const shift = await this.requireOpenShift(id, actor)

    const result = await this.prismaService.$transaction(async (tx) => {
      const movement = await this.repo.addMovement(
        shift.id,
        shift.branchId,
        { ...data, createdById: actor.userId },
        tx,
      )

      const amount = new Prisma.Decimal(data.amount)
      const lines =
        data.type === 'IN'
          ? [
              { accountCode: 'CASH', direction: 'DEBIT' as const, amount },
              { accountCode: 'OTHER_INCOME', direction: 'CREDIT' as const, amount },
            ]
          : [
              { accountCode: 'OTHER_EXPENSE', direction: 'DEBIT' as const, amount },
              { accountCode: 'CASH', direction: 'CREDIT' as const, amount },
            ]

      const entry = await this.ledgerPosting.postEntry(
        {
          branchId: shift.branchId,
          refType: 'CASH_MOVEMENT',
          refId: movement.id,
          // cùng 1 phiếu thu chỉ có 1 bút toán, kể cả khi request bị gửi lặp
          idempotencyKey: `cash-movement:${movement.id}`,
          memo: `${data.type === 'IN' ? 'Thu' : 'Chi'} tiền mặt trong ca #${shift.id}: ${data.reason}`,
          lines,
        },
        tx,
      )

      return { movement, ledgerEntryId: entry.id }
    })

    return toMoneyNumbers({ ...result.movement, ledgerEntryId: result.ledgerEntryId })
  }

  /**
   * Dong ca (ticket P2-1):
   *  expectedCash = openingFloat + Σ thu tien mat trong ca + Σ IN - Σ OUT
   *  variance     = countedCash - expectedCash
   *  lech -> but toan CASH_SHORTAGE / CASH_OVERAGE, cung transaction voi viec dong ca.
   */
  async close(id: number, actor: Actor, data: CloseCashShiftType) {
    const shift = await this.requireOpenShift(id, actor)

    const unpaid = await this.repo.findUnpaidCashOrderIds({ branchId: shift.branchId, from: shift.openedAt })
    if (unpaid.length > 0) throw CashShiftHasUnpaidCashOrdersException(unpaid)

    const [cashIn, movements] = await Promise.all([
      this.repo.sumCashPayments({ branchId: shift.branchId, from: shift.openedAt }),
      this.repo.sumMovements(shift.id),
    ])

    const totals = cashShiftTotals({
      openingFloat: shift.openingFloat,
      cashIn,
      cashInMovements: movements.cashIn,
      cashOut: movements.cashOut,
    })
    const countedCash = new Prisma.Decimal(data.countedCash)
    const variance = cashVariance(totals.expectedCash, countedCash)
    const lines = cashVarianceLines(variance)

    const closed = await this.prismaService.$transaction(async (tx) => {
      const updated = await tx.cashShift.updateMany({
        where: { id: shift.id, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          countedCash,
          expectedCash: totals.expectedCash,
          variance,
          cashIn: totals.cashIn,
          cashOut: totals.cashOut,
          note: data.note ?? shift.note ?? null,
          closedById: actor.userId,
        },
      })
      // 2 nguoi dong ca cung luc -> chi 1 thang
      if (updated.count !== 1) throw CashShiftClosedException

      if (lines.length > 0) {
        const entry = await this.ledgerPosting.postEntry(
          {
            branchId: shift.branchId,
            refType: 'CASH_VARIANCE',
            refId: shift.id,
            idempotencyKey: `cash-shift:${shift.id}:variance`,
            memo: `Đóng ca #${shift.id}: ${variance.isNegative() ? 'thiếu' : 'thừa'} ${variance.abs().toFixed(0)}đ`,
            lines: lines.map((line) => ({
              accountCode: line.accountCode,
              direction: line.direction,
              amount: line.amount,
            })),
          },
          tx,
        )
        await tx.cashShift.update({ where: { id: shift.id }, data: { ledgerEntryId: entry.id } })
      }

      return tx.cashShift.findUnique({ where: { id: shift.id } })
    })

    return toMoneyNumbers(closed)
  }

  private async requireOpenShift(id: number, actor: Actor) {
    const branchId = await resolveBranchId(this.prismaService, { userId: actor.userId, roleName: actor.roleName })
    const shift = await this.repo.findById(id, branchId)
    if (!shift) throw CashShiftNotFoundException
    // Nguoi khac chi duoc thu/chi/dong ca khi la ADMIN
    if (shift.staffId !== actor.userId && actor.roleName !== roleName.ADMIN) throw CashShiftNotOwnedException
    if (shift.status !== 'OPEN') throw CashShiftClosedException
    return shift
  }

  private async withLiveTotals(found: Awaited<ReturnType<CashShiftRepo['findById']>>) {
    if (!found) throw CashShiftNotFoundException
    const shift = found
    if (shift.status !== 'OPEN') {
      // Ca đã đóng: lấy đúng khoảng thời gian của ca để giải thích `cashIn`
      const closedPayments = await this.repo.cashPaymentsIn({
        branchId: shift.branchId,
        from: shift.openedAt,
        to: shift.closedAt ?? undefined,
      })
      return toMoneyNumbers({
        ...shift,
        cashPayments: closedPayments.map((payment) => ({
          paymentId: payment.id,
          amount: payment.amount,
          paidAt: payment.paidAt,
          method: payment.method,
          orderIds: payment.order.map((order) => order.id),
        })),
        liveTotals: {
          openingFloat: shift.openingFloat,
          cashIn: shift.cashIn,
          cashInMovements: new Prisma.Decimal(0),
          cashOut: shift.cashOut,
          expectedCash: shift.expectedCash ?? shift.openingFloat,
          unpaidCashOrders: 0,
        },
      })
    }

    const [cashIn, movements, unpaid, cashPayments] = await Promise.all([
      this.repo.sumCashPayments({ branchId: shift.branchId, from: shift.openedAt }),
      this.repo.sumMovements(shift.id),
      this.repo.findUnpaidCashOrderIds({ branchId: shift.branchId, from: shift.openedAt }),
      this.repo.cashPaymentsIn({ branchId: shift.branchId, from: shift.openedAt }),
    ])
    const totals = cashShiftTotals({
      openingFloat: shift.openingFloat,
      cashIn,
      cashInMovements: movements.cashIn,
      cashOut: movements.cashOut,
    })

    return toMoneyNumbers({
      ...shift,
      cashPayments: cashPayments.map((payment) => ({
        paymentId: payment.id,
        amount: payment.amount,
        paidAt: payment.paidAt,
        method: payment.method,
        orderIds: payment.order.map((order) => order.id),
      })),
      liveTotals: {
        ...totals,
        unpaidCashOrders: unpaid.length,
      },
    })
  }
}
