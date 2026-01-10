import { CategoryTranslationSchema } from '@/shared/models/shared-category-translation.model'
import { z } from 'zod'

export const CategorySchema = z.object({
  id: z.number(),
  parentCategoryId: z.number().nullable(),
  logo: z
    .string({ message: 'Error.LogoMustBeString' })
    .min(2, { message: 'Error.TooShort' })
    .max(500, { message: 'Error.TooLong' }),
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
