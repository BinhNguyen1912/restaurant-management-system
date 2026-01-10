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

export type CategoryTranslationBodyType = z.infer<typeof CategoryTranslationBodySchema>
export type UpdateCategoryTranslationBodyType = z.infer<typeof UpdateCategoryTranslationBodySchema>
