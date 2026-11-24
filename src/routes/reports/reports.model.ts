import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { z } from 'zod'

/**
 * Báo cáo doanh thu đọc từ projection `DailyBranchSummary` (ticket #09, ADR 0001 D8).
 *
 * Không query runtime từ Order: số liệu báo cáo lấy từ sổ cái đã ghi, nên báo cáo và sổ
 * không bao giờ lệch nhau. Muốn số đúng thì chạy `recompute` cho kỳ đó.
 */
export const ReportRangeSchema = z.object({
  /** yyyy-MM-dd (giờ VN). Bỏ trống = hôm nay */
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  /** bỏ trống = chi nhánh của tài khoản đang đăng nhập */
  branchId: z.coerce.number().int().positive().optional(),
})

export const RecomputeSchema = ReportRangeSchema

export const SummaryRowSchema = z.object({
  date: z.string(),
  branchId: z.number(),
  branchCode: z.string(),
  branchName: z.string(),
  currency: z.string(),
  gross: moneyOutputSchema,
  discount: moneyOutputSchema,
  serviceCharge: moneyOutputSchema,
  tip: moneyOutputSchema,
  tax: moneyOutputSchema,
  net: moneyOutputSchema,
  grandTotal: moneyOutputSchema,
  cashIn: moneyOutputSchema,
  vnpayIn: moneyOutputSchema,
  refund: moneyOutputSchema,
  cogs: moneyOutputSchema,
  orderCount: z.number(),
})

export const SummaryTotalsSchema = z.object({
  gross: moneyOutputSchema,
  discount: moneyOutputSchema,
  serviceCharge: moneyOutputSchema,
  tip: moneyOutputSchema,
  tax: moneyOutputSchema,
  net: moneyOutputSchema,
  grandTotal: moneyOutputSchema,
  cashIn: moneyOutputSchema,
  vnpayIn: moneyOutputSchema,
  refund: moneyOutputSchema,
  cogs: moneyOutputSchema,
  orderCount: z.number(),
})

export const RevenueReportResSchema = z.object({
  message: z.string(),
  fromDate: z.string(),
  toDate: z.string(),
  branchId: z.number().nullable(),
  rows: z.array(SummaryRowSchema),
  totals: SummaryTotalsSchema,
  /** doanh thu theo phương thức thanh toán (đọc từ projection) */
  byMethod: z.array(
    z.object({
      method: z.enum(['CASH', 'VNPAY']),
      amount: moneyOutputSchema,
    }),
  ),
})

export const RevenueByItemResSchema = z.object({
  message: z.string(),
  fromDate: z.string(),
  toDate: z.string(),
  branchId: z.number().nullable(),
  rows: z.array(
    z.object({
      productId: z.number().nullable(),
      name: z.string(),
      quantity: z.number(),
      revenue: moneyOutputSchema,
    }),
  ),
})

export const RecomputeResSchema = z.object({
  message: z.string(),
  fromDate: z.string(),
  toDate: z.string(),
  branchId: z.number().nullable(),
  /** số ô (ngày × chi nhánh) đã ghi lại */
  written: z.number(),
  /** số ô cũ bị xoá trước khi ghi (dữ liệu đã dọn thì projection cũng sạch) */
  cleared: z.number(),
})

export type ReportRangeType = z.infer<typeof ReportRangeSchema>
