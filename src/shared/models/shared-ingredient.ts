import z from 'zod'

export const IngredientSchema = z.object({
  id: z.number(),
  name: z.string(),
  stock: z.number(),
  unitId: z.string(),
  image: z.string().nullable().optional(),
  minStock: z.number().nullable(),
  isActive: z.boolean(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type IngredientType = z.infer<typeof IngredientSchema>
