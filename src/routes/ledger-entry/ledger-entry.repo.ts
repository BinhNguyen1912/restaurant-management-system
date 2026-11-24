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
