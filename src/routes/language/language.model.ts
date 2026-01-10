import { z } from 'zod'

export const LanguageSchema = z.object({
  id: z.string().min(2, { message: 'Error.TooShort' }).max(10, { message: 'Error.TooLong' }),
  name: z.string().min(2, { message: 'Error.TooShort' }).max(10, { message: 'Error.TooLong' }),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const LanguageBodySchema = LanguageSchema.pick({
  id: true,
  name: true,
})
export const LanguageResSchema = LanguageSchema
export const UpdateLanguageBodySchema = LanguageSchema.pick({
  name: true,
}).strict()

export const GetAllLanguageResSchema = z.object({
  data: z.array(LanguageSchema),
  totalItem: z.number(),
})

export const GetLanguageDetailResSchema = LanguageSchema

export const getLanguageIncludeCreateByShema = LanguageSchema.extend({
  createdBy: z.object({
    id: z.number(),
    name: z.string(),
  }),
})

export type LanguageType = z.infer<typeof LanguageSchema>
export type GetAllLanguageResType = z.infer<typeof GetAllLanguageResSchema>
export type LanguageBodyType = z.infer<typeof LanguageBodySchema>
export type LanguageResType = z.infer<typeof LanguageResSchema>
export type UpdateLanguageBodyType = z.infer<typeof UpdateLanguageBodySchema>
