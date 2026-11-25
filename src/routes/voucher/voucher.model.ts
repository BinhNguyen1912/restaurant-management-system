import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { z } from 'zod'

/**
 * Quản lý voucher (khuyến mãi) — trước đây mã chỉ tạo được bằng seed, khách thì đã nhập được mã.
 * Áp dụng voucher khi đặt món nằm ở `VoucherService.applyVoucher` (ticket #02).
 */
export const VoucherTypeSchema = z.enum(['PERCENT', 'FIXED'])
export const VoucherStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED'])

const codeSchema = z
  .string()
  .trim()
  .min(3, 'Mã tối thiểu 3 ký tự')
  .max(50, 'Mã tối đa 50 ký tự')
  .regex(/^[A-Za-z0-9_-]+$/, 'Mã chỉ gồm chữ, số, gạch ngang/gạch dưới (không dấu cách)')

/** body dùng chung cho tạo/sửa — kiểm chéo PERCENT ≤ 100 và endAt > startAt */
export const VoucherBodySchema = z
  .object({
    code: codeSchema,
    discountType: VoucherTypeSchema,
    // trần theo cột Decimal(14,2) — vượt là Postgres ném lỗi 500 thay vì 422
    discountValue: z.coerce.number().positive('Giá trị giảm phải lớn hơn 0').max(1_000_000_000, 'Giá trị giảm quá lớn'),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    /** null = không giới hạn lượt; trần theo cột Int 32-bit */
    usageLimit: z.coerce.number().int().positive().max(1_000_000, 'Số lượt quá lớn').nullable().optional(),
    /** EXPIRED chỉ do hệ thống đặt (đọc ở response), client chỉ bật/tắt được ACTIVE <-> INACTIVE */
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === 'PERCENT' && data.discountValue > 100) {
      ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Giảm theo % không được vượt 100' })
    }
    if (data.endAt.getTime() <= data.startAt.getTime()) {
      ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'Thời gian kết thúc phải sau thời gian bắt đầu' })
    }
  })

export const VoucherQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  /** tìm theo mã */
  search: z.string().trim().optional(),
  status: VoucherStatusSchema.optional(),
})

export const VoucherResSchema = z.object({
  id: z.number(),
  code: z.string(),
  discountType: VoucherTypeSchema,
  discountValue: moneyOutputSchema,
  startAt: z.date(),
  endAt: z.date(),
  usageLimit: z.number().nullable(),
  /** đã dùng bao nhiêu lượt = số snapshot đã sinh */
  usedCount: z.number(),
  /** còn dùng được ngay bây giờ không (đang ACTIVE + trong thời gian + còn lượt) */
  usableNow: z.boolean(),
  status: VoucherStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const VoucherDetailResSchema = z.object({
  message: z.string(),
  data: VoucherResSchema,
})

export const VoucherListResSchema = z.object({
  message: z.string(),
  data: z.array(VoucherResSchema),
  totalItems: z.number(),
  page: z.number(),
  limit: z.number(),
})

export const VoucherStatusBodySchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) })

export type VoucherBodyType = z.infer<typeof VoucherBodySchema>
export type VoucherQueryType = z.infer<typeof VoucherQuerySchema>
