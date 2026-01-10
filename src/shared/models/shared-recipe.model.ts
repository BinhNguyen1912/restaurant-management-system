import z from 'zod'

export const SKURecipeIngredientSchema = z.object({
  id: z.number(),
  skuId: z.number(),
  ingredientId: z.number(),
  quantity: z.number(),
  unitId: z.string(),

  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export const skuRecipeIngredientDetailResSchema = z.object({
  sku: z.object({
    id: z.number(),
    value: z.string(),
    image: z.string().nullable(),
    product: z.object({
      id: z.number(),
      name: z.string(),
    }),
  }),
  skuRecipeIngredients: z.array(
    z.object({
      skuRecipeIngredientsId: z.number(),
      name: z.string(),
      quantity: z.number(),
      unit: z.string(),
      ingredientId: z.number(),
    }),
  ),
})
export type SKURecipeIngredientType = z.infer<typeof SKURecipeIngredientSchema>
export type SkuRecipeIngredientDetailResType = z.infer<typeof skuRecipeIngredientDetailResSchema>
