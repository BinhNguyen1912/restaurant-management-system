import { IngredientSchema } from '@/shared/models/shared-ingredient'
import { UnitSchema } from '@/shared/models/shared-unit.model'
import { UserSchema } from '@/shared/models/shared-user.model'
import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import z from 'zod'

export const ingredientBodySchema = IngredientSchema.pick({
  name: true,
  unitId: true,
  stock: true,
  image: true,
  isActive: true,
})
  .extend({
    enableLowStockWarning: z.boolean().default(false),
    minStock: z.number().positive().optional(),
    /** giá nhập / 1 đơn vị (đồng) — dùng để tính COGS; bỏ trống = 0 (chưa khai giá) */
    unitCost: z.coerce.number().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    // Nếu enableLowStockWarning = true thì minStock là bắt buộc
    if (data.enableLowStockWarning && !data.minStock) {
      ctx.addIssue({
        code: 'custom',
        path: ['minStock'],
        message: 'minStock is required when enableLowStockWarning is true',
      })
    }
    // Nếu enableLowStockWarning = false thì không cần minStock
    if (!data.enableLowStockWarning && data.minStock) {
      ctx.addIssue({
        code: 'custom',
        path: ['minStock'],
        message: 'minStock should not be provided when enableLowStockWarning is false',
      })
    }
  })
export const ingredientResSchema = IngredientSchema

export const getIngredientDetailResSchema = IngredientSchema.extend({
  unit: UnitSchema,
  createdBy: UserSchema.pick({
    name: true,
    id: true,
  }).nullable(),
})
export const getAllIngredientResSchema = z.object({
  data: z.array(getIngredientDetailResSchema),
  totalItems: z.number(),
  totalPages: z.number(),
  page: z.number(),
  limit: z.number(),
})
export const ingredientParamsSchema = z.object({
  id: z.coerce.number(),
})

export const ingredientQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
})

export const updateIngredientBodySchema = IngredientSchema.pick({
  name: true,
  unitId: true,
  stock: true,
  image: true,
  isActive: true,
})
  .extend({
    enableLowStockWarning: z.boolean().optional(),
    minStock: z.number().positive().optional(),
    /** giá nhập / 1 đơn vị — sửa được để cập nhật giá vốn */
    unitCost: z.coerce.number().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    // Nếu enableLowStockWarning = true thì minStock là bắt buộc
    if (data.enableLowStockWarning === true && !data.minStock) {
      ctx.addIssue({
        code: 'custom',
        path: ['minStock'],
        message: 'minStock is required when enableLowStockWarning is true',
      })
    }
    // // Nếu enableLowStockWarning = false thì không cần minStock
    // if (data.enableLowStockWarning === false && data.minStock) {
    //   ctx.addIssue({
    //     code: 'custom',
    //     path: ['minStock'],
    //     message: 'minStock should not be provided when enableLowStockWarning is false',
    //   })
    // }
  })

export type CreateIngredientBodyType = z.infer<typeof ingredientBodySchema>
export type UpdateIngredientBodyType = z.infer<typeof updateIngredientBodySchema>
export type GetAllIngredientResType = z.infer<typeof getAllIngredientResSchema>
export type GetIngredientDetailResType = z.infer<typeof ingredientResSchema>
export type GetIngredientParamsType = z.infer<typeof ingredientParamsSchema>
export type IngredientQueryType = z.infer<typeof ingredientQuerySchema>

/**
 * Nhập hàng (stock receipt).
 *
 * `quantity` phải > 0: nhập 0 hoặc âm là vô nghĩa, và âm sẽ trừ tồn — chặn ở schema thay vì
 * để người dùng "sửa tồn" bằng đường nhập hàng (đường đó phải luôn là cộng thêm).
 */
export const CreateStockReceiptSchema = z
  .object({
    quantity: z.coerce.number().positive('Số lượng nhập phải lớn hơn 0').max(1_000_000),
    unitCost: z.coerce.number().min(0, 'Giá nhập không âm').max(1_000_000_000).optional(),
    supplier: z.string().trim().max(255).optional(),
    note: z.string().trim().max(500).optional(),
    /** ảnh bằng chứng (URL từ /media) — nhiều ảnh để chụp cả phiếu giao hàng và hàng thực tế */
    images: z.array(z.string().trim().min(1)).max(5, 'Tối đa 5 ảnh').optional(),
  })
  .strict()

export const StockReceiptSchema = z.object({
  id: z.number(),
  ingredientId: z.number(),
  quantity: z.number(),
  unitCost: moneyOutputSchema,
  supplier: z.string().nullable(),
  note: z.string().nullable(),
  images: z.array(z.string()),
  /** tồn kho NGAY SAU lần nhập này — đọc lại là biết đã cộng đúng */
  stockAfter: z.number(),
  receivedAt: z.date(),
  createdById: z.number().nullable(),
  /** tên người nhập, để lịch sử đọc được mà không phải join thêm */
  createdByName: z.string().nullable().optional(),
})

export const StockReceiptListResSchema = z.object({
  message: z.string(),
  data: z.array(StockReceiptSchema),
})

/** Trả về sau khi nhập: tồn mới + giá vốn mới để FE hiện ngay */
export const CreateStockReceiptResSchema = z.object({
  message: z.string(),
  data: z.object({
    receipt: StockReceiptSchema,
    stock: z.number(),
    unitCost: moneyOutputSchema,
  }),
})

export type CreateStockReceiptType = z.infer<typeof CreateStockReceiptSchema>
export type StockReceiptType = z.infer<typeof StockReceiptSchema>
