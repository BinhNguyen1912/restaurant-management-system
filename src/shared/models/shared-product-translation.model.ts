import { z } from 'zod'

export const ProductTranslationSchema = z.object({
  id: z.number(),
  name: z.string().min(2, { message: 'Error.TooShort' }).max(100, { message: 'Error.TooLong' }),
  description: z.string().min(2, { message: 'Error.TooShort' }).max(100, { message: 'Error.TooLong' }),
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
