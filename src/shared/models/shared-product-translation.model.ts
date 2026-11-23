import { z } from 'zod'

/**
 * Schema DÙNG ĐỂ TRẢ RA (output). Không siết min như input: dữ liệu cũ có thể tên/mô tả ngắn hoặc rỗng
 * (trước đây description min 2 khiến mọi product có translation mô tả rỗng bị 500 khi serialize).
 */
export const ProductTranslationSchema = z.object({
  id: z.number(),
  name: z.string().max(500),
  description: z.string().max(2000),
  languageId: z.string(),
  productId: z.number(),

  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type ProductTranslationType = z.infer<typeof ProductTranslationSchema>
