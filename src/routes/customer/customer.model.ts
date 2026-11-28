import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { z } from 'zod'

/**
 * Hồ sơ khách hàng (tầng CRM). Khách chỉ đọc được của chính mình qua đặt bàn; các endpoint dưới
 * đây là màn hình vận hành (quầy thu ngân tra SĐT) và báo cáo (quản lý/khách hàng thân thiết).
 */

export const CustomerListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  /** tên hoặc SĐT (gõ có dấu cách vẫn tìm được: phần số được chuẩn hoá trước khi so) */
  search: z.string().trim().optional(),
  /** bỏ trống = ADMIN thấy mọi chi nhánh, người khác bị ép về chi nhánh của mình */
  branchId: z.coerce.number().int().positive().optional(),
  /** `newest` = hồ sơ mới tạo trước; `name` = theo tên A→Z */
  sort: z.enum(['newest', 'name']).default('newest'),
})

/** Số liệu tích luỹ của một khách — luôn tính lại từ đơn/đặt bàn, không lưu bản sao. */
export const CustomerStatsSchema = z.object({
  /** số đơn ĐÃ THU TIỀN (PAID) — đơn đang mở chưa phải doanh thu */
  orderCount: z.number(),
  totalSpend: moneyOutputSchema,
  avgSpend: moneyOutputSchema,
  /** số lượt đặt bàn (kể cả chưa tới) */
  reservationCount: z.number(),
  firstVisitAt: z.date().nullable(),
  lastVisitAt: z.date().nullable(),
})

export const CustomerSchema = z.object({
  id: z.number(),
  phone: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  note: z.string().nullable(),
  /** tài khoản khách đã đăng ký (nếu có) */
  userId: z.number().nullable(),
  stats: CustomerStatsSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const CustomerOrderSchema = z.object({
  id: z.number(),
  status: z.string(),
  grandTotal: moneyOutputSchema,
  branchName: z.string(),
  tableName: z.string().nullable(),
  createdAt: z.date(),
})

export const CustomerReservationSchema = z.object({
  id: z.number(),
  reservationTime: z.date(),
  guestCount: z.number(),
  status: z.string(),
  branchName: z.string(),
  tableName: z.string().nullable(),
})

export const CustomerDetailSchema = CustomerSchema.extend({
  recentOrders: z.array(CustomerOrderSchema),
  recentReservations: z.array(CustomerReservationSchema),
})

export const CustomerListResSchema = z.object({
  message: z.string(),
  data: z.array(CustomerSchema),
  totalItems: z.number(),
  page: z.number(),
  limit: z.number(),
})

export const CustomerDetailResSchema = z.object({
  message: z.string(),
  data: CustomerDetailSchema,
})

/** Ghi chú chăm sóc khách (ghi đè; null = xoá ghi chú). */
export const CustomerNoteBodySchema = z.object({
  note: z.string().trim().max(2000, 'Ghi chú tối đa 2000 ký tự').nullable(),
})

export const CustomerNoteResSchema = z.object({
  message: z.string(),
  data: z.object({ id: z.number(), note: z.string().nullable() }),
})

export const CustomerReportQuerySchema = z.object({
  /** yyyy-MM-dd (giờ VN). Bỏ trống = hôm nay */
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  branchId: z.coerce.number().int().positive().optional(),
})

export const CustomerTopSchema = z.object({
  id: z.number(),
  name: z.string(),
  phone: z.string(),
  orderCount: z.number(),
  totalSpend: moneyOutputSchema,
})

export const CustomerReportResSchema = z.object({
  message: z.string(),
  data: z.object({
    fromDate: z.string(),
    toDate: z.string(),
    branchId: z.number().nullable(),
    /** số hồ sơ khách đang có trong hệ thống (không phụ thuộc kỳ) */
    profileCount: z.number(),

    /** khách có phát sinh đơn đã thu tiền trong kỳ */
    activeCustomers: z.number(),
    /** trong số đó, lần đầu tới nằm trong kỳ */
    newCustomers: z.number(),
    /** trong số đó, đã từng tới trước kỳ */
    returningCustomers: z.number(),
    /** returningCustomers / activeCustomers, 0 khi kỳ không có khách nào */
    repeatRate: z.number(),
    topCustomers: z.array(CustomerTopSchema),
  }),
})

export type CustomerListQueryType = z.infer<typeof CustomerListQuerySchema>
export type CustomerReportQueryType = z.infer<typeof CustomerReportQuerySchema>
