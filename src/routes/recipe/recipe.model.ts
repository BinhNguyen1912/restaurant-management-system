import { IngredientSchema } from '@/shared/models/shared-ingredient'
import { ProductSchema } from '@/shared/models/shared-product.model'
import { SKURecipeIngredientSchema } from '@/shared/models/shared-recipe.model'
import { SKUSchema } from '@/shared/models/shared-sku.model'
import { UnitSchema } from '@/shared/models/shared-unit.model'
import z from 'zod'

export const skuRecipeIngredientBodySchema = z.object({
  skuId: z.number(),
  ingredients: z.array(
    z.object({
      ingredientId: z.number(),
      quantity: z.number(),
      unitId: z.string(),
    }),
  ),
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

export const skuRecipeIngredientParamsSchema = z.object({
  skuId: z.string(),
})

export const skuRecipeIngredientListResSchema = z.object({
  data: z.array(
    SKURecipeIngredientSchema.extend({
      ingredient: IngredientSchema.pick({
        name: true,
        id: true,
      }),
      unit: UnitSchema.pick({ name: true }),
      sku: SKUSchema.extend({
        product: ProductSchema.pick({
          name: true,
          id: true,
        }),
      }),
    }),
  ),
  totalItems: z.number(),
  totalPages: z.number(),
  page: z.number(),
  limit: z.number(),
})

export type SkuRecipeIngredientDetailResType = z.infer<typeof skuRecipeIngredientDetailResSchema>
export type SkuRecipeIngredientBodyType = z.infer<typeof skuRecipeIngredientBodySchema>
export type skuRecipeIngredientListResType = z.infer<typeof skuRecipeIngredientListResSchema>
