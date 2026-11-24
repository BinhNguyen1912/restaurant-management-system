import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { LedgerRow, SummaryCell } from '@/routes/reports/revenue-summary'

/**
 * Đọc/ghi bảng projection `DailyBranchSummary`.
 *
 * Không có API nào ghi tay vào bảng này: chỉ job `recompute` được phép (upsert theo
 * (date, branchId, currency)). Sai thì tính lại, không sửa tay.
 */
@Injectable()
export class ReportsRepo {
  constructor(private readonly prismaService: PrismaService) {}

  /** dòng sổ cái POSTED trong kỳ (mọi chi nhánh nếu không lọc) */
  async ledgerRows(gte: Date, lte: Date, branchId?: number): Promise<LedgerRow[]> {
    const entries = await this.prismaService.ledgerEntry.findMany({
      where: {
        status: 'POSTED',
        occurredAt: { gte, lte },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        branchId: true,
        occurredAt: true,
        refType: true,
        refId: true,
        lines: {
          select: {
            direction: true,
            amount: true,
            account: { select: { code: true } },
          },
        },
      },
    })

    const rows: LedgerRow[] = []
    for (const entry of entries) {
      if (!entry.occurredAt) continue
      for (const line of entry.lines) {
        rows.push({
          branchId: entry.branchId,
          occurredAt: entry.occurredAt,
          refType: entry.refType,
          refId: entry.refId,
          accountCode: line.account.code,
          direction: line.direction,
          amount: line.amount,
        })
      }
    }
    return rows
  }

  async upsertMany(cells: SummaryCell[], currency = 'VND') {
    let written = 0
    for (const cell of cells) {
      const date = new Date(`${cell.date}T00:00:00.000Z`)
      const data = {
        gross: cell.gross,
        discount: cell.discount,
        serviceCharge: cell.serviceCharge,
        tip: cell.tip,
        tax: cell.tax,
        net: cell.net,
        grandTotal: cell.grandTotal,
        cashIn: cell.cashIn,
        vnpayIn: cell.vnpayIn,
        refund: cell.refund,
        cogs: cell.cogs,
        orderCount: cell.orderCount,
        currency,
      }
      await this.prismaService.dailyBranchSummary.upsert({
        where: { date_branchId_currency: { date, branchId: cell.branchId, currency } },
        create: { date, branchId: cell.branchId, ...data },
        update: data,
      })
      written += 1
    }
    return written
  }

  /** xoá dòng projection cũ của kỳ trước khi ghi lại (tránh dòng mồ côi khi dữ liệu bị dọn) */
  async clearRange(from: Date, to: Date, branchId?: number) {
    const { count } = await this.prismaService.dailyBranchSummary.deleteMany({
      where: { date: { gte: from, lte: to }, ...(branchId ? { branchId } : {}) },
    })
    return count
  }

  async summaries(from: Date, to: Date, branchId?: number) {
    return this.prismaService.dailyBranchSummary.findMany({
      where: { date: { gte: from, lte: to }, ...(branchId ? { branchId } : {}) },
      orderBy: [{ date: 'asc' }, { branchId: 'asc' }],
      include: { branch: { select: { code: true, name: true } } },
    })
  }

  /** số liệu theo món: lấy từ đơn ĐÃ THU TIỀN (snapshot giá tại thời điểm bán) */
  async revenueByItem(gte: Date, lte: Date, branchId?: number) {
    const items = await this.prismaService.productSKUSnapshot.findMany({
      where: {
        order: {
          is: {
            status: 'PAID',
            deletedAt: null,
            createdAt: { gte, lte },
            ...(branchId ? { branchId } : {}),
          },
        },
      },
      select: {
        productId: true,
        productName: true,
        quantity: true,
        skuPrice: true,
      },
    })

    const byProduct = new Map<string, { productId: number | null; name: string; quantity: number; revenue: Prisma.Decimal }>()
    for (const item of items) {
      const key = `${item.productId ?? 'x'}:${item.productName}`
      const current = byProduct.get(key) ?? {
        productId: item.productId,
        name: item.productName,
        quantity: 0,
        revenue: new Prisma.Decimal(0),
      }
      current.quantity += item.quantity
      current.revenue = current.revenue.add(new Prisma.Decimal(item.skuPrice).mul(item.quantity))
      byProduct.set(key, current)
    }

    return [...byProduct.values()]
      .map((row) => ({ ...row, revenue: row.revenue.toDecimalPlaces(0) }))
      .sort((a, b) => b.revenue.comparedTo(a.revenue))
  }
}
