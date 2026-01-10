import { UnitConversionSchema } from '@/shared/models/shared-unitConversion.model'
import z from 'zod'

export const unitConversionBodyShema = UnitConversionSchema.pick({
  fromUnitId: true,
  toUnitId: true,
  factor: true,
})

export const unitConversionResSchema = UnitConversionSchema

export const unitConversionUpdateBodySchema = UnitConversionSchema.pick({
  fromUnitId: true,
  toUnitId: true,
  factor: true,
})

export const getAllUnitConversionResSchema = z.object({
  data: z.array(UnitConversionSchema),
  totalItems: z.number(),
})
export const unitConversionParamsSchema = z.object({
  id: z.coerce.number(),
})

export type unitConversionBodyType = z.infer<typeof unitConversionBodyShema>
export type unitConversionResType = z.infer<typeof unitConversionResSchema>
export type unitConversionUpdateBodyType = z.infer<typeof unitConversionUpdateBodySchema>
export type getAllUnitConversionResType = z.infer<typeof getAllUnitConversionResSchema>
export type unitConversionParamsType = z.infer<typeof unitConversionParamsSchema>
