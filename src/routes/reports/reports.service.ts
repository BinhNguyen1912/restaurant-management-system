import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { resolveBranchId } from '@/shared/service/branch.resolver'
import { PrismaService } from '@/shared/service/prisma.service'
import { ReportsRepo } from '@/routes/reports/reports.repo'
import { ReportRangeType } from '@/routes/reports/reports.model'
import { aggregateSummaries, resolveRange } from '@/routes/reports/revenue-summary'
import { SYSTEM_TIME_ZONE } from '@/shared/config/timezone'

/**
 * Báo cáo doanh thu (ticket #09).
 *
 * Hai nửa:
 *  - `recompute`: job đọc sổ cái → ghi projection `DailyBranchSummary` (upsert, chạy lại được).
 *  - các hàm đọc: chỉ đọc projection, không cộng Order → nhanh và không bao giờ lệch sổ.
 *
 * Cron chạy 01:05 giờ VN hằng ngày, tính lại 7 ngày gần nhất để bắt kịp bút toán đảo/hoàn tiền
 * được ghi muộn.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name)

  constructor(
    private readonly repo: ReportsRepo,
    private readonly prismaService: PrismaService,
  ) {}

  /** chi nhánh đang xét: query thắng, không có thì lấy theo tài khoản đăng nhập */
  private async scopeBranch(query: ReportRangeType, actor?: { userId?: number | null; roleName?: string | null }) {
    if (query.branchId) return query.branchId
    return resolveBranchId(this.prismaService, { userId: actor?.userId, roleName: actor?.roleName })
  }

  /** Tính lại projection cho 1 kỳ (chạy tay được, cron cũng gọi hàm này) */
  async recompute(query: ReportRangeType, actor?: { userId?: number | null; roleName?: string | null }) {
    const branchId = await this.scopeBranch(query, actor)
    const { from, to, gte, lte } = resolveRange(query.fromDate, query.toDate)

    const rows = await this.repo.ledgerRows(gte, lte, branchId)
    const cells = aggregateSummaries(rows)

    const cleared = await this.repo.clearRange(new Date(`${from}T00:00:00.000Z`), new Date(`${to}T00:00:00.000Z`), branchId)
    const written = await this.repo.upsertMany(cells)

    this.logger.log(
      `recompute ${from}..${to} branch=${branchId}: ${rows.length} dòng sổ cái -> ${written} ô (xoá ${cleared} ô cũ)`,
    )

    return {
      message: 'Success.Recompute',
      fromDate: from,
      toDate: to,
      branchId,
      written,
      cleared,
    }
  }

  async revenue(query: ReportRangeType, actor?: { userId?: number | null; roleName?: string | null }) {
    await this.ensureProjection(query, actor)
    const branchId = await this.scopeBranch(query, actor)
    const { from, to } = resolveRange(query.fromDate, query.toDate)
    const summaries = await this.repo.summaries(
      new Date(`${from}T00:00:00.000Z`),
      new Date(`${to}T00:00:00.000Z`),
      branchId,
    )

    const dec = (value: unknown) => Number(value ?? 0)
    const totals = {
      gross: 0,
      discount: 0,
      serviceCharge: 0,
      tip: 0,
      tax: 0,
      net: 0,
      grandTotal: 0,
      cashIn: 0,
      vnpayIn: 0,
      refund: 0,
      cogs: 0,
      orderCount: 0,
    }

    const rows = summaries.map((row) => {
      const mapped = {
        date: row.date.toISOString().slice(0, 10),
        branchId: row.branchId,
        branchCode: row.branch.code,
        branchName: row.branch.name,
        currency: row.currency,
        gross: dec(row.gross),
        discount: dec(row.discount),
        serviceCharge: dec(row.serviceCharge),
        tip: dec(row.tip),
        tax: dec(row.tax),
        net: dec(row.net),
        grandTotal: dec(row.grandTotal),
        cashIn: dec(row.cashIn),
        vnpayIn: dec(row.vnpayIn),
        refund: dec(row.refund),
        cogs: dec(row.cogs),
        orderCount: row.orderCount,
      }

      for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
        totals[key] += mapped[key]
      }
      return mapped
    })

    return {
      message: 'Success.RevenueReport',
      fromDate: from,
      toDate: to,
      branchId,
      rows,
      totals,
      byMethod: [
        { method: 'CASH' as const, amount: totals.cashIn },
        { method: 'VNPAY' as const, amount: totals.vnpayIn },
      ],
    }
  }

  async revenueByItem(query: ReportRangeType, actor?: { userId?: number | null; roleName?: string | null }) {
    const branchId = await this.scopeBranch(query, actor)
    const { from, to, gte, lte } = resolveRange(query.fromDate, query.toDate)
    const rows = await this.repo.revenueByItem(gte, lte, branchId)

    return {
      message: 'Success.RevenueByItem',
      fromDate: from,
      toDate: to,
      branchId,
      rows: rows.map((row) => ({
        productId: row.productId,
        name: row.name,
        quantity: row.quantity,
        revenue: Number(row.revenue),
      })),
    }
  }

  /**
   * Báo cáo phải có số: kỳ chưa được tính thì tính luôn (lần đọc đầu tiên sau khi deploy,
   * hoặc ngày hôm nay chưa tới 01:05). Không có bút toán nào → projection rỗng, trả 0 hết.
   */
  private async ensureProjection(query: ReportRangeType, actor?: { userId?: number | null; roleName?: string | null }) {
    const branchId = await this.scopeBranch(query, actor)
    const { from, to } = resolveRange(query.fromDate, query.toDate)
    const existing = await this.repo.summaries(
      new Date(`${from}T00:00:00.000Z`),
      new Date(`${to}T00:00:00.000Z`),
      branchId,
    )
    if (existing.length > 0) return
    await this.recompute(query, actor)
  }

  /** 01:05 giờ VN mỗi ngày: tính lại 7 ngày gần nhất cho MỌI chi nhánh */
  @Cron('0 5 1 * * *', { timeZone: SYSTEM_TIME_ZONE })
  async recomputeDaily() {
    const { from } = resolveRange(undefined, undefined)
    const to = new Date(`${from}T00:00:00.000Z`)
    const start = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000)
    const branches = await this.prismaService.branch.findMany({ where: { isActive: true }, select: { id: true } })

    for (const branch of branches) {
      const gte = new Date(`${start.toISOString().slice(0, 10)}T00:00:00.000+07:00`)
      const lte = new Date(`${from}T23:59:59.999+07:00`)
      const rows = await this.repo.ledgerRows(gte, lte, branch.id)
      const cells = aggregateSummaries(rows)
      await this.repo.clearRange(start, to, branch.id)
      const written = await this.repo.upsertMany(cells)
      this.logger.log(`cron recompute branch=${branch.id}: ${written} ô`)
    }
  }
}
