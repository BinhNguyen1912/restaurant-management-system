import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { resolveBranchScope } from '@/shared/service/branch.resolver'
import { PrismaService } from '@/shared/service/prisma.service'
import { ReportsRepo } from '@/routes/reports/reports.repo'
import { ReportRangeType } from '@/routes/reports/reports.model'
import { aggregateSummaries, resolveRange } from '@/routes/reports/revenue-summary'
import { SYSTEM_TIME_ZONE } from '@/shared/config/timezone'

/**
 * Tuổi tối đa của projection cho kỳ CHƯA đóng (có ngày hôm nay). Trong ngày doanh thu vẫn đang
 * chảy, nên số đã tính phải được làm mới; 60 giây đủ nhanh cho người xem và đủ rẻ cho DB.
 */
const PROJECTION_TTL_MS = 60_000

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
  /**
   * Phạm vi chi nhánh của báo cáo.
   *
   * ADMIN là cấp tổng: không truyền `branchId` thì thấy **TỔNG mọi chi nhánh** — trước đây rơi về
   * "chi nhánh active đầu tiên" nên admin chỉ thấy MỘT chi nhánh mà không có dấu hiệu gì.
   * Truyền `branchId` thì xem riêng chi nhánh đó. Người không phải ADMIN luôn bị ép về chi nhánh mình.
   */
  private async scopeBranch(query: ReportRangeType, actor?: { userId?: number | null; roleName?: string | null }) {
    return resolveBranchScope(this.prismaService, actor, query.branchId)
  }

  /** Tính lại projection cho 1 kỳ (chạy tay được, cron cũng gọi hàm này) */
  async recompute(query: ReportRangeType, actor?: { userId?: number | null; roleName?: string | null }) {
    const scope = await this.scopeBranch(query, actor)
    // scope undefined (ADMIN không chọn chi nhánh) = tính lại cho MỌI chi nhánh active
    const branchIds = scope
      ? [scope]
      : (await this.prismaService.branch.findMany({ where: { isActive: true }, select: { id: true } })).map(
          (branch) => branch.id,
        )
    if (branchIds.length === 0) throw new BadRequestException('Error.BranchNotConfigured')

    const results: { branchId: number; written: number; cleared: number }[] = []
    for (const branchId of branchIds) results.push(await this.recomputeBranch(branchId, query))

    const { from, to } = resolveRange(query.fromDate, query.toDate)
    // Giữ shape cũ (`written`/`cleared`/`branchId`) để client đang đọc `written` không vỡ;
    // written/cleared giờ là TỔNG các chi nhánh đã tính, chi tiết nằm trong `branches`.
    return {
      message: 'Success.Recompute',
      fromDate: from,
      toDate: to,
      branchId: scope ?? null,
      written: results.reduce((sum, item) => sum + item.written, 0),
      cleared: results.reduce((sum, item) => sum + item.cleared, 0),
      branches: results,
    }
  }

  private async recomputeBranch(branchId: number, query: ReportRangeType) {
    const { from, to, gte, lte } = resolveRange(query.fromDate, query.toDate)

    const rows = await this.repo.ledgerRows(gte, lte, branchId)
    const cells = aggregateSummaries(rows)

    const cleared = await this.repo.clearRange(new Date(`${from}T00:00:00.000Z`), new Date(`${to}T00:00:00.000Z`), branchId)
    const written = await this.repo.upsertMany(cells)

    this.logger.log(
      `recompute ${from}..${to} branch=${branchId}: ${rows.length} dòng sổ cái -> ${written} ô (xoá ${cleared} ô cũ)`,
    )

    return { branchId, written, cleared }
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
      branchId: branchId ?? null,
      rows,
      totals,
      byMethod: [
        { method: 'CASH' as const, amount: totals.cashIn },
        { method: 'VNPAY' as const, amount: totals.vnpayIn },
      ],
    }
  }

  /**
   * Tổng quan Dashboard: 4 ô tiền của kỳ + so sánh doanh thu thuần với:
   *  - **kỳ trước** có cùng độ dài (hôm nay -> hôm qua; 7 ngày -> 7 ngày trước đó),
   *  - **cùng kỳ tháng trước** (cùng ngày, lùi 1 tháng).
   *
   * Tất cả đọc từ projection `DailyBranchSummary` như `revenue()`, nên số khớp báo cáo doanh thu
   * và sổ cái; không cộng lại từ Order. Một lần `ensureProjection` cho khoảng rộng nhất (gồm cả
   * kỳ so sánh) để không phải tính projection 3 lần.
   */
  async overview(query: ReportRangeType, actor?: { userId?: number | null; roleName?: string | null }) {
    const branchId = await this.scopeBranch(query, actor)
    const { from, to } = resolveRange(query.fromDate, query.toDate)

    const dayMs = 24 * 60 * 60 * 1000
    const lengthDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs) + 1
    const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10)

    // kỳ trước: lùi đúng bằng độ dài kỳ này
    const previousFrom = shift(from, -lengthDays)
    const previousTo = shift(from, -1)
    // cùng kỳ tháng trước: cùng ngày, lùi 1 tháng (giữ đúng độ dài)
    const lastMonthFrom = shiftMonth(from, -1)
    const lastMonthTo = shiftMonth(to, -1)

    const widestFrom = [from, previousFrom, lastMonthFrom].sort()[0]
    await this.ensureProjection({ fromDate: widestFrom, toDate: to }, actor)

    const load = async (rangeFrom: string, rangeTo: string) => {
      const rows = await this.repo.summaries(
        new Date(`${rangeFrom}T00:00:00.000Z`),
        new Date(`${rangeTo}T00:00:00.000Z`),
        branchId,
      )
      const total = rows.reduce(
        (acc, row) => ({
          gross: acc.gross + Number(row.gross),
          tax: acc.tax + Number(row.tax),
          discount: acc.discount + Number(row.discount),
          serviceCharge: acc.serviceCharge + Number(row.serviceCharge),
          tip: acc.tip + Number(row.tip),
          net: acc.net + Number(row.net),
          grandTotal: acc.grandTotal + Number(row.grandTotal),
          refund: acc.refund + Number(row.refund),
          cashIn: acc.cashIn + Number(row.cashIn),
          vnpayIn: acc.vnpayIn + Number(row.vnpayIn),
          orderCount: acc.orderCount + row.orderCount,
        }),
        {
          gross: 0,
          tax: 0,
          discount: 0,
          serviceCharge: 0,
          tip: 0,
          net: 0,
          grandTotal: 0,
          refund: 0,
          cashIn: 0,
          vnpayIn: 0,
          orderCount: 0,
        },
      )
      return { fromDate: rangeFrom, toDate: rangeTo, ...total }
    }

    const [current, previous, lastMonth] = await Promise.all([
      load(from, to),
      load(previousFrom, previousTo),
      load(lastMonthFrom, lastMonthTo),
    ])

    /** % thay đổi; null khi kỳ so sánh bằng 0 — thà "chưa có số" còn hơn hiện -100% giả */
    const change = (now: number, before: number) =>
      before === 0 ? null : Math.round(((now - before) / before) * 10000) / 100

    return {
      message: 'Success.DashboardOverview',
      data: {
        fromDate: from,
        toDate: to,
        branchId: branchId ?? null,
        gross: current.gross,
        tax: current.tax,
        discount: current.discount,
        serviceCharge: current.serviceCharge,
        tip: current.tip,
        cashIn: current.cashIn,
        vnpayIn: current.vnpayIn,
        grandTotal: current.grandTotal,
        net: current.net,
        refund: current.refund,
        orderCount: current.orderCount,
        previous,
        lastMonth,
        changeVsPrevious: change(current.net, previous.net),
        changeVsLastMonth: change(current.net, lastMonth.net),
      },
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
      // ADMIN xem tổng -> `undefined`; schema là `number | null` nên PHẢI là null.
      // `undefined` làm ZodSerializer ném "expected number, received undefined" -> 500.
      branchId: branchId ?? null,
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
   *
   * Kỳ CHƯA ĐÓNG (có ngày hôm nay) thì không được coi "có 1 dòng là xong": doanh thu vẫn đang
   * chảy, dùng lại ô tính từ 10:00 sẽ trả số cũ suốt ngày. Chỉ dùng lại nếu vừa tính trong
   * `PROJECTION_TTL_MS`; ngày đã qua thì cache vĩnh viễn (cron 01:05 đã chốt).
   */
  private async ensureProjection(query: ReportRangeType, actor?: { userId?: number | null; roleName?: string | null }) {
    const branchId = await this.scopeBranch(query, actor)
    const { from, to } = resolveRange(query.fromDate, query.toDate)
    const existing = await this.repo.summaries(
      new Date(`${from}T00:00:00.000Z`),
      new Date(`${to}T00:00:00.000Z`),
      branchId,
    )

    const today = resolveRange(undefined, undefined).from
    const isOpenPeriod = to >= today

    if (existing.length > 0) {
      if (!isOpenPeriod) return
      const freshest = existing.reduce<Date>(
        (latest, row) => ((row as any).updatedAt > latest ? (row as any).updatedAt : latest),
        new Date(0),
      )
      if (Date.now() - freshest.getTime() < PROJECTION_TTL_MS) return
    }

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

/**
 * Lùi `months` tháng nhưng giữ ngày hợp lệ: 31/03 lùi 1 tháng -> 28/02 (không tràn sang 03/03
 * như `Date.setMonth`, vì tràn tháng sẽ làm kỳ so sánh lệch hẳn).
 */
function shiftMonth(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}
