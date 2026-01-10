import z from 'zod'

export const UnitConversionSchema = z.object({
  id: z.number(),
  fromUnitId: z.string().toLowerCase(),
  toUnitId: z.string().toLowerCase(),
  factor: z.number(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type UnitType = z.infer<typeof UnitConversionSchema>
