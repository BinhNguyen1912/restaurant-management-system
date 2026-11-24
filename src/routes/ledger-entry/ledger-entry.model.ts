import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { z } from 'zod'

/**
 * Nhật ký sổ cái (audit) — ticket follow-up của #05.
 *
 * Trang "Sổ cái — danh mục tài khoản" chỉ hiện TỔNG Nợ/Có theo tài khoản, không trả lời được
 * "bút toán nào tạo ra số đó" hay "sổ có cân không". Ở đây trả về từng bút toán kèm dòng chi tiết.
 */
export const LedgerRefTypeSchema = z.enum([
  'ORDER_PAID_CASH',
  'ORDER_PAID_VNPAY',
  'RESERVATION_DEPOSIT',
  'DEPOSIT_SETTLED',
  'REFUND',
  'REVERSAL',
  'CASH_VARIANCE',
])

export const LedgerEntryStatusSchema = z.enum(['DRAFT', 'POSTED'])

export const LedgerLineSchema = z.object({
  id: z.number(),
  accountCode: z.string(),
  accountName: z.string(),
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: moneyOutputSchema,
  orderId: z.number().nullable(),
  paymentId: z.number().nullable(),
})

/** Bút toán + số tổng của chính nó: sai cân thì thấy ngay trên 1 dòng */
export const LedgerEntrySchema = z.object({
  id: z.number(),
  branchId: z.number(),
  occurredAt: z.date(),
  refType: LedgerRefTypeSchema,
  refId: z.number(),
  memo: z.string().nullable(),
  currency: z.string(),
  idempotencyKey: z.string(),
  status: LedgerEntryStatusSchema,
  postedAt: z.date().nullable(),
  reversalOfId: z.number().nullable(),
  debitTotal: moneyOutputSchema,
  creditTotal: moneyOutputSchema,
  balanced: z.boolean(),
  lines: z.array(LedgerLineSchema),
})

export const LedgerEntryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  /** lọc theo ngày phát sinh (yyyy-mm-dd) */
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  refType: LedgerRefTypeSchema.optional(),
  status: LedgerEntryStatusSchema.optional(),
  /** lọc bút toán có dòng của 1 tài khoản, vd CASH */
  accountCode: z.string().trim().toUpperCase().optional(),
  /** tìm trong memo / idempotencyKey / refId */
  search: z.string().trim().optional(),
})

export const LedgerEntryListResSchema = z.object({
  data: z.array(LedgerEntrySchema),
  totalItems: z.number(),
  totalPages: z.number(),
  page: z.number(),
  limit: z.number(),
  /** tổng của TOÀN BỘ kết quả lọc (không chỉ trang hiện tại) */
  totals: z.object({
    debit: moneyOutputSchema,
    credit: moneyOutputSchema,
    difference: moneyOutputSchema,
  }),
})

export const LedgerIntegrityResSchema = z.object({
  ok: z.boolean(),
  totalDebit: moneyOutputSchema,
  totalCredit: moneyOutputSchema,
  /** totalDebit - totalCredit; khác 0 = sổ lệch */
  difference: moneyOutputSchema,
  postedEntries: z.number(),
  draftEntries: z.number(),
  lineCount: z.number(),
  unbalancedEntries: z.number(),
  staleDrafts: z.number(),
  paidPaymentsWithoutEntry: z.number(),
  checkedAt: z.date(),
})

export type LedgerEntryType = z.infer<typeof LedgerEntrySchema>
export type LedgerEntryQueryType = z.infer<typeof LedgerEntryQuerySchema>
export type LedgerEntryListResType = z.infer<typeof LedgerEntryListResSchema>
export type LedgerIntegrityResType = z.infer<typeof LedgerIntegrityResSchema>
