import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { z } from 'zod'

/**
 * Ca lam viec + két tien mat (ticket P2-1, ADR 0001 D7).
 * Tien ra API la number (xem money-serializer), DB la Decimal.
 */
export const CashShiftStatusEnum = z.enum(['OPEN', 'CLOSED'])
export const CashMovementTypeEnum = z.enum(['IN', 'OUT'])

export const CashMovementSchema = z.object({
  id: z.number(),
  shiftId: z.number(),
  type: CashMovementTypeEnum,
  reason: z.string(),
  amount: moneyOutputSchema,
  /** Ảnh/video chứng từ (hoá đơn, biên nhận) */
  evidenceUrls: z.array(z.string()).default([]),
  createdById: z.number().nullable(),
  createdAt: z.date(),
  /** Bút toán sổ cái sinh ra từ khoản này — thiếu khai báo là serializer cắt mất */
  ledgerEntryId: z.number().nullable().optional(),
})

export const CashShiftSchema = z.object({
  id: z.number(),
  branchId: z.number(),
  staffId: z.number(),
  status: CashShiftStatusEnum,
  openedAt: z.date(),
  closedAt: z.date().nullable(),
  openingFloat: moneyOutputSchema,
  countedCash: moneyOutputSchema.nullable(),
  expectedCash: moneyOutputSchema.nullable(),
  variance: moneyOutputSchema.nullable(),
  cashIn: moneyOutputSchema,
  cashOut: moneyOutputSchema,
  note: z.string().nullable(),
  ledgerEntryId: z.number().nullable(),
  closedById: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type CashShiftType = z.infer<typeof CashShiftSchema>
export type CashMovementType = z.infer<typeof CashMovementSchema>

/** So két "hien tai" (ca dang mo) — tinh lai tu du lieu song, khong lay so da chot */
export const CashShiftLiveTotalsSchema = z.object({
  openingFloat: moneyOutputSchema,
  cashIn: moneyOutputSchema,
  cashInMovements: moneyOutputSchema,
  cashOut: moneyOutputSchema,
  expectedCash: moneyOutputSchema,
  /** So don tien mat chua thu trong ca (phai = 0 moi duoc dong ca) */
  unpaidCashOrders: z.number(),
})

/** Một khoản tiền mặt thu được từ đơn trong ca — để giải thích `cashIn` gồm những gì */
export const CashShiftPaymentRowSchema = z.object({
  paymentId: z.number(),
  amount: moneyOutputSchema,
  paidAt: z.date().nullable(),
  method: z.string().nullable(),
  /** mã đơn liên quan (nếu có) để mở đơn từ trang chi tiết ca */
  orderIds: z.array(z.number()),
})

export const CashShiftDetailSchema = CashShiftSchema.extend({
  movements: z.array(CashMovementSchema),
  liveTotals: CashShiftLiveTotalsSchema.optional(),
  /**
   * Các khoản thu tiền mặt từ đơn trong ca. Không có danh sách này thì `cashIn` lại là một con số
   * không kiểm tra được — đúng vấn đề đã gặp ở Sổ quỹ.
   */
  cashPayments: z.array(CashShiftPaymentRowSchema).optional(),
})

export const OpenCashShiftSchema = z.object({
  /**
   * Số tiền két đầu ca. Dùng `z.number()` (KHÔNG coerce): `z.coerce.number()` biến `null`
   * thành 0, nên client gửi thiếu/không parse được số tiền vẫn được chấp nhận với 0đ.
   */
  openingFloat: z
    .number()
    .min(0, 'Tiền lẻ đầu ca không âm')
    .max(1_000_000_000, 'Tiền lẻ đầu ca quá lớn')
    .transform((value) => Math.round(value)),
  note: z.string().trim().max(500).optional(),
})

export const CloseCashShiftSchema = z.object({
  countedCash: z
    .number()
    .min(0, 'Tiền đếm được không âm')
    .max(10_000_000_000, 'Tiền đếm được quá lớn')
    .transform((value) => Math.round(value)),
  note: z.string().trim().max(500).optional(),
})

export const CashEvidenceUrlSchema = z
  .string()
  .trim()
  .url('Chứng từ phải là URL hợp lệ')
  .max(500)
  // Chỉ nhận link https (Cloudinary) — tránh dán link nội bộ/lạ vào sổ
  .refine((url) => url.startsWith('https://'), 'Chứng từ phải là link https')

export const CreateCashMovementSchema = z.object({
  type: CashMovementTypeEnum,
  reason: z.string().trim().min(1, 'Phải ghi lý do thu/chi').max(255),
  amount: z.coerce
    .number()
    .positive('Số tiền phải lớn hơn 0')
    .max(10_000_000_000, 'Số tiền quá lớn')
    .transform((value) => Math.round(value)),
  /** Tối đa 5 ảnh/video chứng từ — upload qua POST /media/upload trước */
  evidenceUrls: z.array(CashEvidenceUrlSchema).max(5, 'Tối đa 5 chứng từ').optional().default([]),
})

export const CashShiftParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const CashShiftListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: CashShiftStatusEnum.optional(),
})

export type OpenCashShiftType = z.infer<typeof OpenCashShiftSchema>
export type CloseCashShiftType = z.infer<typeof CloseCashShiftSchema>
export type CreateCashMovementType = z.infer<typeof CreateCashMovementSchema>
export type CashShiftListQueryType = z.infer<typeof CashShiftListQuerySchema>

export const CashShiftListResSchema = z.object({
  data: z.array(CashShiftSchema),
  totalItems: z.number(),
  totalPages: z.number(),
  page: z.number(),
  limit: z.number(),
})

export type CashShiftListResType = z.infer<typeof CashShiftListResSchema>
