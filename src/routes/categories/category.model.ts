import { CategoryIncludeTranslationSchema, CategorySchema } from '@/shared/models/shared-category.model'
import { z } from 'zod'

export const getAllCategorySchema = z.object({
  data: z.array(CategoryIncludeTranslationSchema),
  totalItems: z.number(),
})
export const getCatoryriesQuerySchema = z.object({
  parentCategoryId: z.coerce.number().int().positive().optional(),
})

export const getCategoryParamSchema = z
  .object({
    parentCategoryId: z.coerce.number().int().positive(),
  })
  .strict()
export const getCategoryDetailSchema = CategoryIncludeTranslationSchema
export const CategoryBodySchema = CategorySchema.pick({
  name: true,
  parentCategoryId: true,
}).extend({
  // Khi TẠO/SỬA danh mục thì ảnh là bắt buộc và phải là URL hợp lệ
  logo: z
    .string({ message: 'Error.LogoMustBeString' })
    .trim()
    .min(2, { message: 'Error.TooShort' })
    .max(500, { message: 'Error.TooLong' })
    .refine((value) => !value || /^(https?:)?\/\//.test(value), { message: 'Error.InvalidUrl' }),
})
export const UpdateCategoryBodySchema = CategoryBodySchema.partial()
export type CategoryBodyType = z.infer<typeof CategoryBodySchema>
export type CategoryResType = z.infer<typeof CategorySchema>
export type UpdateCategoryBodyType = z.infer<typeof UpdateCategoryBodySchema>
export type CategoryParamType = z.infer<typeof getCategoryParamSchema>
export type CategoriesQueryType = z.infer<typeof getCatoryriesQuerySchema>
export type GetCategoryDetailType = z.infer<typeof getCategoryDetailSchema>
export type GetAllCategoryType = z.infer<typeof getAllCategorySchema>
