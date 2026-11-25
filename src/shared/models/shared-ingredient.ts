import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import z from 'zod'

export const IngredientSchema = z.object({
  id: z.number(),
  name: z.string(),
  stock: z.number(),
  /// giá nhập bình quân / 1 đơn vị — nguồn tính COGS (ticket #11)
  unitCost: moneyOutputSchema,
  unitId: z.string(),
  image: z.string().nullable().optional(),
  minStock: z.number().nullable(),
  isActive: z.boolean(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type IngredientType = z.infer<typeof IngredientSchema>
