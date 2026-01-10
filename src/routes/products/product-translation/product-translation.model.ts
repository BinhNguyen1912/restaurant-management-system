import { ProductTranslationSchema } from '@/shared/models/shared-product-translation.model'
import { z } from 'zod'

export const getProductTranslationParamSchema = z
  .object({
    productTranslationId: z.coerce.number().int().positive(),
  })
  .strict()

export const getProductTranslationDetailResSchema = ProductTranslationSchema

export const ProductTranslationBodySchema = ProductTranslationSchema.pick({
  name: true,
  description: true,
  languageId: true,
  productId: true,
}).strict()

export const UpdateProductTranslationBodySchema = ProductTranslationBodySchema.partial()

export type ProductTranslationBodyType = z.infer<typeof ProductTranslationBodySchema>

export type UpdateProductTranslationBodyType = z.infer<typeof UpdateProductTranslationBodySchema>

export type GetProductTranslationDetailResType = z.infer<typeof getProductTranslationDetailResSchema>
