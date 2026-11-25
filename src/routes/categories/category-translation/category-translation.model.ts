import { CategoryTranslationSchema } from '@/shared/models/shared-category-translation.model'
import { z } from 'zod'

export const CategoryTranslationBodySchema = CategoryTranslationSchema.pick({
  categoryId: true,
  languageId: true,
  name: true,
  description: true,
}).strict()
export const UpdateCategoryTranslationBodySchema = CategoryTranslationBodySchema.partial()
export const getCategoryTranslationParamSchema = z.object({
  categoryTranslationId: z.coerce.number().int().positive(),
})
export const CategoryTranslationResSchema = CategoryTranslationSchema

/** Liệt kê bản dịch của 1 danh mục (màn hình quản trị cần biết id của từng bản dịch để sửa) */
export const GetCategoryTranslationsQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive(),
})

export const CategoryTranslationListResSchema = z.object({
  message: z.string(),
  data: z.array(CategoryTranslationSchema),
})

export type CategoryTranslationBodyType = z.infer<typeof CategoryTranslationBodySchema>
export type UpdateCategoryTranslationBodyType = z.infer<typeof UpdateCategoryTranslationBodySchema>
export type GetCategoryTranslationsQueryType = z.infer<typeof GetCategoryTranslationsQuerySchema>
