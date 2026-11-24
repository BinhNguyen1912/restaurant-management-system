import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import {
  CreateLedgerAccountType,
  LedgerAccountQueryType,
  UpdateLedgerAccountType,
} from '@/routes/ledger-account/ledger-account.model'

const NORMAL_SIDE: Record<string, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT',
  EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT',
  REVENUE: 'CREDIT',
  EQUITY: 'CREDIT',
}

@Injectable()
export class LedgerAccountRepo {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Danh mục + số dư. Chỉ cộng bút toán đã POSTED — bút toán DRAFT không được lên báo cáo.
   */
  async list(query: LedgerAccountQueryType) {
    const where: Prisma.LedgerAccountWhereInput = {}
    if (query.type) where.type = query.type
    if (query.isActive !== undefined) where.isActive = query.isActive
    if (query.search) {
      const search = query.search
      where.OR = [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }]
    }

    const [accounts, sums] = await Promise.all([
      this.prismaService.ledgerAccount.findMany({ where, orderBy: [{ isSystem: 'desc' }, { code: 'asc' }] }),
      this.prismaService.ledgerLine.groupBy({
        by: ['accountId', 'direction'],
        where: { entry: { status: 'POSTED' } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ])

    const byAccount = new Map<number, { debit: Prisma.Decimal; credit: Prisma.Decimal; count: number }>()
    for (const row of sums) {
      const current = byAccount.get(row.accountId) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
        count: 0,
      }
      const amount = new Prisma.Decimal(row._sum.amount ?? 0)
      if (row.direction === 'DEBIT') current.debit = current.debit.add(amount)
      else current.credit = current.credit.add(amount)
      current.count += row._count._all
      byAccount.set(row.accountId, current)
    }

    return accounts.map((account) => {
      const totals = byAccount.get(account.id) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0), count: 0 }
      const normalSide = NORMAL_SIDE[account.type] ?? 'DEBIT'
      const balance = normalSide === 'DEBIT' ? totals.debit.minus(totals.credit) : totals.credit.minus(totals.debit)

      return {
        ...account,
        totalDebit: totals.debit.toDecimalPlaces(2),
        totalCredit: totals.credit.toDecimalPlaces(2),
        balance: balance.toDecimalPlaces(2),
        normalSide,
        lineCount: totals.count,
      }
    })
  }

  findById(id: number) {
    return this.prismaService.ledgerAccount.findUnique({ where: { id } })
  }

  findByCode(code: string) {
    return this.prismaService.ledgerAccount.findUnique({ where: { code } })
  }

  countLines(accountId: number) {
    return this.prismaService.ledgerLine.count({ where: { accountId } })
  }

  create(data: CreateLedgerAccountType) {
    return this.prismaService.ledgerAccount.create({ data: { ...data, isSystem: false, isCash: false } })
  }

  update(id: number, data: UpdateLedgerAccountType) {
    return this.prismaService.ledgerAccount.update({ where: { id }, data })
  }

  delete(id: number) {
    return this.prismaService.ledgerAccount.delete({ where: { id } })
  }
}
