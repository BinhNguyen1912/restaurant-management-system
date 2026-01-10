import z from 'zod'

export const UnitSchema = z.object({
  name: z.string().toLowerCase(),
  description: z.string(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type UnitType = z.infer<typeof UnitSchema>
