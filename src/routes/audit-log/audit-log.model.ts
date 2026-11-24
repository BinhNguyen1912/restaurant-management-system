import { z } from 'zod'

/**
 * Đọc nhật ký thao tác nhạy cảm (ticket #10). CHỈ ĐỌC — không có endpoint sửa/xoá:
 * nhật ký sửa được thì không còn là bằng chứng.
 */
export const AuditActionSchema = z.enum([
  'ORDER_CANCELLED',
  'ORDER_DISCOUNT_CHANGED',
  'ORDER_PRICE_CHANGED',
  'PRODUCT_PRICE_CHANGED',
  'PAYMENT_REFUNDED',
])

export const AuditEntityTypeSchema = z.enum(['ORDER', 'PRODUCT', 'SKU', 'PAYMENT'])

export const AuditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(30),
  action: AuditActionSchema.optional(),
  entityType: AuditEntityTypeSchema.optional(),
  entityId: z.coerce.number().int().positive().optional(),
  actorId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  /** yyyy-MM-dd (giờ VN) */
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
})

export const AuditLogResSchema = z.object({
  message: z.string(),
  data: z.array(
    z.object({
      id: z.number(),
      actorId: z.number().nullable(),
      actorRole: z.string().nullable(),
      actorName: z.string().nullable(),
      action: AuditActionSchema,
      entityType: AuditEntityTypeSchema,
      entityId: z.number(),
      before: z.any().nullable(),
      after: z.any().nullable(),
      reason: z.string().nullable(),
      branchId: z.number().nullable(),
      createdAt: z.date(),
    }),
  ),
  totalItems: z.number(),
  page: z.number(),
  limit: z.number(),
})

export type AuditLogQueryType = z.infer<typeof AuditLogQuerySchema>
