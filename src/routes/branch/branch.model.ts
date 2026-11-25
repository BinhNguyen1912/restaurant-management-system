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
  /**
   * Số nhân viên / bàn / đơn đang gắn với chi nhánh — chỉ có trong danh sách.
   * Cần khai báo ở đây, nếu không `ZodSerializerDto` sẽ **loại bỏ** trường này khi trả về.
   */
  usage: z
    .object({ users: z.number(), tables: z.number(), orders: z.number() })
    .optional(),
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

/**
 * Tạo / sửa chi nhánh.
 *
 * `code` là duy nhất (đã có @unique trong DB) và được in lên báo cáo, nên chuẩn hoá hoa và
 * bỏ khoảng trắng ở server thay vì tin FE gửi đúng.
 */
export const BranchBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, 'Mã chi nhánh tối thiểu 2 ký tự')
      .max(50, 'Mã chi nhánh tối đa 50 ký tự')
      .transform((value) => value.toUpperCase().replace(/\s+/g, '_')),
    name: z.string().trim().min(2, 'Tên chi nhánh tối thiểu 2 ký tự').max(255),
    address: z.string().trim().max(500).optional(),
    timezone: z.string().trim().max(64).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()

export const UpdateBranchBodySchema = BranchBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'Không có thay đổi nào' },
)

export const BranchListResSchema = z.object({
  data: z.array(BranchSettingsSchema),
})

export type BranchSettingsType = z.infer<typeof BranchSettingsSchema>
export type UpdateBranchSettingsType = z.infer<typeof UpdateBranchSettingsSchema>
export type BranchListResType = z.infer<typeof BranchListResSchema>
export type BranchBodyType = z.infer<typeof BranchBodySchema>
export type UpdateBranchBodyType = z.infer<typeof UpdateBranchBodySchema>
