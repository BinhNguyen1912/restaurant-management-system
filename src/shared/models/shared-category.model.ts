import { CategoryTranslationSchema } from '@/shared/models/shared-category-translation.model'
import { z } from 'zod'

export const CategorySchema = z.object({
  id: z.number(),
  parentCategoryId: z.number().nullable(),
  /**
   * Ảnh danh mục CÓ THỂ rỗng (danh mục chưa upload ảnh). Schema này là schema OUTPUT
   * (ZodSerializerDto) nên không được `min(2)`: một danh mục chưa có ảnh sẽ làm cả
   * `GET /category` trả 500. Ràng buộc "phải có ảnh" nằm ở body schema (`CategoryBodySchema`).
   */
  logo: z.string({ message: 'Error.LogoMustBeString' }).max(500, { message: 'Error.TooLong' }).default(''),
  name: z
    .string({ message: 'Error.NameMustBeString' })
    .min(2, { message: 'Error.TooShort' })
    .max(100, { message: 'Error.TooLong' }),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export const CategoryIncludeTranslationSchema = CategorySchema.extend({
  categoryTranslations: z.array(CategoryTranslationSchema),
})

export type CategoryType = z.infer<typeof CategorySchema>
export type CategoryIncludeTranslationType = z.infer<typeof CategoryIncludeTranslationSchema>
