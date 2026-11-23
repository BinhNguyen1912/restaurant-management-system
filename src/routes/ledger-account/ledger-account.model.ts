import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { z } from 'zod'

export const LedgerAccountTypeEnum = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'])
export type LedgerAccountTypeValue = z.infer<typeof LedgerAccountTypeEnum>

export const LedgerAccountSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  type: LedgerAccountTypeEnum,
  isCash: z.boolean(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  currency: z.string(),
  /** tổng Nợ / Có đã POSTED */
  totalDebit: moneyOutputSchema,
  totalCredit: moneyOutputSchema,
  /** số dư theo chiều tự nhiên của loại tài khoản */
  balance: moneyOutputSchema,
  normalSide: z.enum(['DEBIT', 'CREDIT']),
  lineCount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

/** Mã: chữ in hoa, số, gạch dưới — vì báo cáo và code tham chiếu bằng mã */
export const LedgerAccountCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{2,49}$/, 'Mã chỉ gồm A-Z, 0-9, _ và bắt đầu bằng chữ cái')

export const CreateLedgerAccountSchema = z.object({
  code: LedgerAccountCodeSchema,
  name: z.string().trim().min(1).max(255),
  type: LedgerAccountTypeEnum,
})

export const UpdateLedgerAccountSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  type: LedgerAccountTypeEnum.optional(),
  isActive: z.boolean().optional(),
})

export const LedgerAccountQuerySchema = z.object({
  search: z.string().trim().optional(),
  type: LedgerAccountTypeEnum.optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
})

export const LedgerAccountParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export type LedgerAccountType = z.infer<typeof LedgerAccountSchema>
export type CreateLedgerAccountType = z.infer<typeof CreateLedgerAccountSchema>
export type UpdateLedgerAccountType = z.infer<typeof UpdateLedgerAccountSchema>
export type LedgerAccountQueryType = z.infer<typeof LedgerAccountQuerySchema>

export const GetLedgerAccountsResSchema = z.object({
  message: z.string(),
  data: z.array(LedgerAccountSchema),
})

export type GetLedgerAccountsResType = z.infer<typeof GetLedgerAccountsResSchema>
