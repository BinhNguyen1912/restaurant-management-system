import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { z } from 'zod'

/**
 * Đối soát theo kỳ, lưu lại lịch sử (ticket #13).
 * `GET /ledger/reconciliation` là bản tính live (để xem nhanh); ở đây là bản GHI LẠI:
 * mỗi lần chạy sinh 1 run + từng item sai lệch để xử lý và giải trình về sau.
 */
export const ReconciliationKindSchema = z.enum([
  'MATCHED',
  'MISSING_IN_LEDGER',
  'AMOUNT_MISMATCH',
  'DUPLICATE',
  'STATUS_MISMATCH',
])

export const RunQuerySchema = z.object({
  /** yyyy-MM-dd (giờ VN). Bỏ trống = hôm qua */
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  branchId: z.coerce.number().int().positive().optional(),
})

export const RunResSchema = z.object({
  message: z.string(),
  run: z.object({
    id: z.number(),
    periodFrom: z.date(),
    periodTo: z.date(),
    branchId: z.number().nullable(),
    status: z.enum(['RUNNING', 'COMPLETED', 'FAILED']),
    summary: z.any().nullable(),
    error: z.string().nullable(),
    startedAt: z.date(),
    finishedAt: z.date().nullable(),
  }),
})

export const RunListSchema = z.object({
  message: z.string(),
  data: z.array(
    z.object({
      id: z.number(),
      periodFrom: z.date(),
      periodTo: z.date(),
      branchId: z.number().nullable(),
      branchCode: z.string().nullable(),
      status: z.enum(['RUNNING', 'COMPLETED', 'FAILED']),
      summary: z.any().nullable(),
      itemCount: z.number(),
      startedAt: z.date(),
      finishedAt: z.date().nullable(),
    }),
  ),
})

export const RunItemSchema = z.object({
  id: z.number(),
  kind: ReconciliationKindSchema,
  refType: z.enum(['PAYMENT', 'VNPAY']),
  refId: z.number(),
  paymentId: z.number().nullable(),
  ledgerEntryId: z.number().nullable(),
  transactionId: z.string().nullable(),
  amountExpected: moneyOutputSchema,
  amountActual: moneyOutputSchema,
  amountDelta: moneyOutputSchema,
  status: z.enum(['OPEN', 'RESOLVED', 'IGNORED']),
  detail: z.any().nullable(),
})

export const RunDetailSchema = z.object({
  message: z.string(),
  run: z.object({
    id: z.number(),
    periodFrom: z.date(),
    periodTo: z.date(),
    branchId: z.number().nullable(),
    branchCode: z.string().nullable(),
    status: z.enum(['RUNNING', 'COMPLETED', 'FAILED']),
    summary: z.any().nullable(),
    error: z.string().nullable(),
    startedAt: z.date(),
    finishedAt: z.date().nullable(),
  }),
  items: z.array(RunItemSchema),
})

export type RunQueryType = z.infer<typeof RunQuerySchema>
