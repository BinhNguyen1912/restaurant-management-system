import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { LedgerEntryQueryType } from '@/routes/ledger-entry/ledger-entry.model'
import { summarizeLines } from '@/routes/ledger-entry/ledger-entry-balance'

/**
 * Đọc sổ cái dưới dạng NHẬT KÝ (audit): mỗi bút toán kèm các dòng Nợ/Có.
 * Chỉ đọc — sổ cái là append-only, sai thì ghi bút toán đảo.
 */
@Injectable()
export class LedgerEntryRepo {
  constructor(private readonly prismaService: PrismaService) {}

  private buildWhere(query: LedgerEntryQueryType): Prisma.LedgerEntryWhereInput {
    const where: Prisma.LedgerEntryWhereInput = {}

    if (query.status) where.status = query.status
    if (query.refType) where.refType = query.refType
    if (query.accountCode) where.lines = { some: { account: { code: query.accountCode } } }

    if (query.fromDate || query.toDate) {
      const occurredAt: Prisma.DateTimeFilter = {}
      if (query.fromDate) occurredAt.gte = new Date(`${query.fromDate}T00:00:00`)
      if (query.toDate) occurredAt.lte = new Date(`${query.toDate}T23:59:59.999`)
      where.occurredAt = occurredAt
    }

    if (query.search) {
      const search = query.search
      const numeric = Number(search.replace('#', ''))
      where.OR = [
        { memo: { contains: search, mode: 'insensitive' } },
        { idempotencyKey: { contains: search, mode: 'insensitive' } },
        ...(Number.isInteger(numeric) && numeric > 0 ? [{ refId: numeric }] : []),
      ]
    }

    return where
  }

  async list(query: LedgerEntryQueryType) {
    const where = this.buildWhere(query)

    const [entries, totalItems, sums] = await Promise.all([
      this.prismaService.ledgerEntry.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          lines: {
            include: { account: { select: { code: true, name: true } } },
            orderBy: { id: 'asc' },
          },
        },
      }),
      this.prismaService.ledgerEntry.count({ where }),
      this.prismaService.ledgerLine.groupBy({
        by: ['direction'],
        where: { entry: where },
        _sum: { amount: true },
      }),
    ])

    const sumBy = (direction: 'DEBIT' | 'CREDIT') =>
      sums.find((row) => row.direction === direction)?._sum.amount ?? new Prisma.Decimal(0)

    const debit = sumBy('DEBIT')
    const credit = sumBy('CREDIT')

    const data = entries.map((entry) => {
      const lines = entry.lines.map((line) => ({
        id: line.id,
        accountCode: line.account.code,
        accountName: line.account.name,
        direction: line.direction as 'DEBIT' | 'CREDIT',
        amount: line.amount,
        orderId: line.orderId,
        paymentId: line.paymentId,
      }))
      const balance = summarizeLines(lines)

      return {
        id: entry.id,
        branchId: entry.branchId,
        occurredAt: entry.occurredAt,
        refType: entry.refType,
        refId: entry.refId,
        memo: entry.memo,
        currency: entry.currency,
        idempotencyKey: entry.idempotencyKey,
        status: entry.status as 'DRAFT' | 'POSTED',
        postedAt: entry.postedAt,
        reversalOfId: entry.reversalOfId,
        debitTotal: balance.debitTotal,
        creditTotal: balance.creditTotal,
        balanced: balance.balanced,
        lines,
      }
    })

    return {
      data,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
      page: query.page,
      limit: query.limit,
      totals: { debit, credit, difference: debit.minus(credit) },
    }
  }

  /** Ảnh chụp toàn sổ: tổng Nợ/Có (chỉ POSTED) + số bút toán theo trạng thái */
  async snapshot() {
    const [sums, postedEntries, draftEntries, lineCount] = await Promise.all([
      this.prismaService.ledgerLine.groupBy({
        by: ['direction'],
        where: { entry: { status: 'POSTED' } },
        _sum: { amount: true },
      }),
      this.prismaService.ledgerEntry.count({ where: { status: 'POSTED' } }),
      this.prismaService.ledgerEntry.count({ where: { status: 'DRAFT' } }),
      this.prismaService.ledgerLine.count({ where: { entry: { status: 'POSTED' } } }),
    ])

    const sumBy = (direction: 'DEBIT' | 'CREDIT') =>
      sums.find((row) => row.direction === direction)?._sum.amount ?? new Prisma.Decimal(0)

    const totalDebit = sumBy('DEBIT')
    const totalCredit = sumBy('CREDIT')

    return {
      totalDebit,
      totalCredit,
      difference: totalDebit.minus(totalCredit),
      postedEntries,
      draftEntries,
      lineCount,
    }
  }
}

/**
 * Đối soát Payment ↔ sổ cái (ticket #13).
 *
 * Nguyên tắc: tiền đã thu theo 1 phương thức phải bằng số phát sinh Nợ trên tài khoản nhận tiền
 * tương ứng — CASH cho tiền mặt, VNPAY_CLEARING cho VNPay. Lệch = có giao dịch thu mà không ghi sổ
 * (hoặc ghi sổ không có giao dịch thật).
 */
export type ReconciliationInput = { fromDate?: string; toDate?: string; branchId?: number }

@Injectable()
export class LedgerReconciliationRepo {
  constructor(private readonly prismaService: PrismaService) {}

  private periodRange(input: ReconciliationInput) {
    if (!input.fromDate && !input.toDate) return undefined
    const range: Prisma.DateTimeFilter = {}
    if (input.fromDate) range.gte = new Date(`${input.fromDate}T00:00:00`)
    if (input.toDate) range.lte = new Date(`${input.toDate}T23:59:59.999`)
    return range
  }

  /** Tổng thu theo phương thức: Payment SUCCESS (mốc thời gian = paidAt) */
  private async paymentTotals(input: ReconciliationInput) {
    const paidAt = this.periodRange(input)
    const rows = await this.prismaService.payment.groupBy({
      by: ['method'],
      where: {
        status: 'SUCCESS',
        ...(paidAt ? { paidAt } : {}),
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      _sum: { amount: true },
      _count: { _all: true },
    })
    return rows
  }

  /** Tổng phát sinh Nợ trên tài khoản nhận tiền (chỉ bút toán POSTED) */
  private async ledgerDebitTotals(accountCodes: string[], input: ReconciliationInput) {
    const occurredAt = this.periodRange(input)
    const rows = await this.prismaService.ledgerLine.groupBy({
      by: ['accountId'],
      where: {
        direction: 'DEBIT',
        entry: {
          status: 'POSTED',
          ...(occurredAt ? { occurredAt } : {}),
          ...(input.branchId ? { branchId: input.branchId } : {}),
        },
        account: { code: { in: accountCodes } },
      },
      _sum: { amount: true },
    })
    const accounts = await this.prismaService.ledgerAccount.findMany({
      where: { code: { in: accountCodes } },
      select: { id: true, code: true },
    })
    const codeById = new Map(accounts.map((account) => [account.id, account.code]))
    const byCode = new Map<string, Prisma.Decimal>()
    for (const row of rows) {
      const code = codeById.get(row.accountId)
      if (code) byCode.set(code, row._sum.amount ?? new Prisma.Decimal(0))
    }
    return byCode
  }

  /** Số dư hiện tại của tiền chờ về VNPAY_CLEARING = Σ Nợ − Σ Có */
  async clearingBalance(branchId?: number) {
    const rows = await this.prismaService.ledgerLine.groupBy({
      by: ['direction'],
      where: {
        account: { code: 'VNPAY_CLEARING' },
        entry: { status: 'POSTED', ...(branchId ? { branchId } : {}) },
      },
      _sum: { amount: true },
    })
    const debit = rows.find((row) => row.direction === 'DEBIT')?._sum.amount ?? new Prisma.Decimal(0)
    const credit = rows.find((row) => row.direction === 'CREDIT')?._sum.amount ?? new Prisma.Decimal(0)
    return debit.minus(credit)
  }

  /** Payment SUCCESS chưa có bút toán POSTED — chính là phần gây lệch */
  async paymentsWithoutEntry(input: ReconciliationInput) {
    const paidAt = this.periodRange(input)
    const orderPayments = await this.prismaService.payment.findMany({
      where: {
        status: 'SUCCESS',
        ...(paidAt ? { paidAt } : {}),
        ...(input.branchId ? { branchId: input.branchId } : {}),
        order: { some: { deletedAt: null } },
      },
      select: { id: true, method: true, amount: true },
      orderBy: { id: 'asc' },
      take: 50,
    })
    if (!orderPayments.length) return []

    const posted = await this.prismaService.ledgerEntry.findMany({
      where: {
        status: 'POSTED',
        refType: { in: ['ORDER_PAID_CASH', 'ORDER_PAID_VNPAY'] },
        refId: { in: orderPayments.map((payment) => payment.id) },
      },
      select: { refId: true },
    })
    const postedIds = new Set(posted.map((entry) => entry.refId))
    return orderPayments
      .filter((payment) => !postedIds.has(payment.id))
      .map((payment) => ({ paymentId: payment.id, method: payment.method, amount: payment.amount }))
  }

  async reconcile(input: ReconciliationInput) {
    const [payments, ledgerDebits, clearing, missing] = await Promise.all([
      this.paymentTotals(input),
      this.ledgerDebitTotals(['CASH', 'VNPAY_CLEARING'], input),
      this.clearingBalance(input.branchId),
      this.paymentsWithoutEntry(input),
    ])

    const sumBy = (method: 'CASH' | 'VNPAY') => {
      const row = payments.find((item) => item.method === method)
      return { amount: row?._sum.amount ?? new Prisma.Decimal(0), count: row?._count._all ?? 0 }
    }

    const build = (method: 'CASH' | 'VNPAY', accountCode: string) => {
      const payment = sumBy(method)
      const ledgerAmount = ledgerDebits.get(accountCode) ?? new Prisma.Decimal(0)
      return {
        method,
        accountCode,
        payments: payment.count,
        paymentAmount: payment.amount,
        ledgerAmount,
        difference: payment.amount.minus(ledgerAmount),
      }
    }

    const methods = [build('CASH', 'CASH'), build('VNPAY', 'VNPAY_CLEARING')]
    const totalPayment = methods.reduce((total, item) => total.add(item.paymentAmount), new Prisma.Decimal(0))
    const totalLedger = methods.reduce((total, item) => total.add(item.ledgerAmount), new Prisma.Decimal(0))

    return {
      fromDate: input.fromDate ?? null,
      toDate: input.toDate ?? null,
      branchId: input.branchId ?? null,
      methods,
      totals: {
        paymentAmount: totalPayment,
        ledgerAmount: totalLedger,
        difference: totalPayment.minus(totalLedger),
      },
      vnpayClearingBalance: clearing,
      paymentsWithoutEntry: missing,
      checkedAt: new Date(),
    }
  }
}
