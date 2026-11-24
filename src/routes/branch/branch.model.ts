import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { z } from 'zod'

/**
 * Cấu hình thuế / phí phục vụ theo chi nhánh.
 *
 * VAT được tính TRÊN ĐƠN (không phải trên từng món): mỗi đơn lưu lại `taxRate` tại thời điểm
 * bán, nên đổi cấu hình hôm nay không làm sai đơn hôm qua và báo cáo thuế theo kỳ vẫn đúng.
 */
export const BranchSettingsSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  /** VAT (%) — 0 = không tính thuế */
  taxRate: moneyOutputSchema,
  /** Phí phục vụ (%) tính trên tiền món sau giảm giá */
  serviceChargeRate: moneyOutputSchema,
  /** Giá menu đã bao gồm VAT chưa (VN thường là ĐÃ gồm) */
  pricesIncludeTax: z.boolean(),
})

const percent = (label: string) =>
  z.coerce
    .number()
    .min(0, `${label} không âm`)
    .max(100, `${label} tối đa 100%`)
    // lưu 2 chữ số thập phân như cột Decimal(5,2)
    .transform((value) => Math.round(value * 100) / 100)

export const UpdateBranchSettingsSchema = z
  .object({
    taxRate: percent('VAT').optional(),
    serviceChargeRate: percent('Phí phục vụ').optional(),
    pricesIncludeTax: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Không có thay đổi nào' })

export const UpdateBranchPricesIncludeTaxSchema = z.object({
  pricesIncludeTax: z.boolean(),
})

export const BranchParamSchema = z.object({ id: z.coerce.number().int().positive() })

export const BranchListResSchema = z.object({
  data: z.array(BranchSettingsSchema),
})

export type BranchSettingsType = z.infer<typeof BranchSettingsSchema>
export type UpdateBranchSettingsType = z.infer<typeof UpdateBranchSettingsSchema>
export type BranchListResType = z.infer<typeof BranchListResSchema>
