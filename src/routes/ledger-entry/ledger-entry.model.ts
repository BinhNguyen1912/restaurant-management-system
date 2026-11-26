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
  'VNPAY_SETTLEMENT',
  'ORDER_COGS',
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
  /** ADMIN lọc được theo chi nhánh; người khác luôn bị ép về chi nhánh của mình */
  branchId: z.coerce.number().int().positive().optional(),
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

/**
 * Đối soát Payment ↔ sổ cái (ticket #13): tiền đã thu theo phương thức phải bằng
 * số dư tài khoản nhận tiền tương ứng (CASH / VNPAY_CLEARING).
 */
export const LedgerReconciliationQuerySchema = z.object({
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  branchId: z.coerce.number().int().positive().optional(),
})

export const LedgerReconciliationResSchema = z.object({
  fromDate: z.string().nullable(),
  toDate: z.string().nullable(),
  branchId: z.number().nullable(),
  methods: z.array(
    z.object({
      method: z.enum(['CASH', 'VNPAY']),
      /** tài khoản nhận tiền tương ứng trong sổ cái */
      accountCode: z.string(),
      payments: z.number(),
      paymentAmount: moneyOutputSchema,
      ledgerAmount: moneyOutputSchema,
      /** paymentAmount - ledgerAmount; ≠ 0 là lệch */
      difference: moneyOutputSchema,
    }),
  ),
  totals: z.object({
    paymentAmount: moneyOutputSchema,
    ledgerAmount: moneyOutputSchema,
    difference: moneyOutputSchema,
  }),
  /** số dư hiện tại của tiền chờ về (all-time), theo chi nhánh nếu có lọc */
  vnpayClearingBalance: moneyOutputSchema,
  /** payment SUCCESS chưa có bút toán POSTED (trong kỳ) */
  paymentsWithoutEntry: z.array(
    z.object({ paymentId: z.number(), method: z.string().nullable(), amount: moneyOutputSchema }),
  ),
  checkedAt: z.date(),
})

export const SettleVnpayClearingSchema = z.object({
  /** số tiền ngân hàng đã báo có */
  amount: z.coerce
    .number()
    .positive('Số tiền phải lớn hơn 0')
    .max(100_000_000_000, 'Số tiền quá lớn')
    .transform((value) => Math.round(value)),
  /** mã giao dịch/sao kê ngân hàng — dùng làm idempotencyKey, không được trùng */
  reference: z.string().trim().min(3, 'Mã đối soát quá ngắn').max(120),
  branchId: z.coerce.number().int().positive().optional(),
  note: z.string().trim().max(500).optional(),
})

export type LedgerReconciliationQueryType = z.infer<typeof LedgerReconciliationQuerySchema>
export type LedgerReconciliationResType = z.infer<typeof LedgerReconciliationResSchema>
export type SettleVnpayClearingType = z.infer<typeof SettleVnpayClearingSchema>
export type LedgerEntryType = z.infer<typeof LedgerEntrySchema>
export type LedgerEntryQueryType = z.infer<typeof LedgerEntryQuerySchema>
export type LedgerEntryListResType = z.infer<typeof LedgerEntryListResSchema>
export type LedgerIntegrityResType = z.infer<typeof LedgerIntegrityResSchema>

/**
 * Sổ quỹ: tiền mặt tại quầy (CASH) và tiền gửi ngân hàng (BANK).
 *
 * Kế toán nhìn "sổ cái" (Nợ/Có mọi tài khoản); quản lý nhà hàng nhìn "sổ quỹ": kỳ này có bao nhiêu
 * tiền, thu vào/chi ra bao nhiêu, còn lại bao nhiêu. Quỹ là tài khoản ASSET nên:
 *   đầu kỳ  = Σ Nợ − Σ Có của mọi bút toán POSTED TRƯỚC kỳ
 *   tổng thu = Σ Nợ trong kỳ (tiền vào), tổng chi = Σ Có trong kỳ (tiền ra)
 *   tồn quỹ  = đầu kỳ + thu − chi
 */
export const CashBookQuerySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  branchId: z.coerce.number().int().positive().optional(),
})

export const CashBookAccountSchema = z.object({
  code: z.string(),
  name: z.string(),
  opening: moneyOutputSchema,
  inflow: moneyOutputSchema,
  outflow: moneyOutputSchema,
  closing: moneyOutputSchema,
})

/** Bọc trong `data` theo đúng quy ước response của project (`{ message, data }`) */
export const CashBookResSchema = z.object({
  message: z.string(),
  data: z.object({
    fromDate: z.string(),
    toDate: z.string(),
    branchId: z.number().nullable(),
    accounts: z.array(CashBookAccountSchema),
    total: CashBookAccountSchema.omit({ code: true, name: true }),
  }),
})

export type CashBookQueryType = z.infer<typeof CashBookQuerySchema>
export type CashBookAccountType = z.infer<typeof CashBookAccountSchema>

/**
 * Danh sách DÒNG của sổ quỹ — chứng minh cho 4 con số trên thẻ.
 *
 * Thẻ chỉ nói "tổng thu 167.259.000đ"; người dùng không có cách nào kiểm tra con số đó.
 * Endpoint này trả từng bút toán (ngày, loại, diễn giải, số tiền) để đối chiếu.
 */
export const CashBookLineQuerySchema = z.object({
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const CashBookLineResSchema = z.object({
  message: z.string(),
  data: z.object({
    fromDate: z.string(),
    toDate: z.string(),
    branchId: z.number().nullable(),
    totalItems: z.number(),
    page: z.number(),
    limit: z.number(),
    /** tổng thu/chi của CHÍNH các dòng đang trả về (cả kỳ) — FE đối chiếu với thẻ */
    inflow: moneyOutputSchema,
    outflow: moneyOutputSchema,
    lines: z.array(
      z.object({
        id: z.number(),
        occurredAt: z.date(),
        refType: z.string(),
        refId: z.number(),
        memo: z.string().nullable(),
        accountCode: z.string(),
        accountName: z.string(),
        direction: z.enum(['DEBIT', 'CREDIT']),
        amount: moneyOutputSchema,
        orderId: z.number().nullable(),
        paymentId: z.number().nullable(),
      }),
    ),
  }),
})

export type CashBookLineQueryType = z.infer<typeof CashBookLineQuerySchema>
