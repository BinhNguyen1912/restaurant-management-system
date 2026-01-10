import {
  skuRecipeIngredientBodySchema,
  skuRecipeIngredientDetailResSchema,
  skuRecipeIngredientListResSchema,
  skuRecipeIngredientParamsSchema,
} from '@/routes/recipe/recipe.model'
import { createZodDto } from 'nestjs-zod'

export class SkuRecipeIngredientBodyDTO extends createZodDto(skuRecipeIngredientBodySchema) {}
export class SkuRecipeIngredientResDTO extends createZodDto(skuRecipeIngredientDetailResSchema) {}
export class SkuRecipeIngredientListResDTO extends createZodDto(skuRecipeIngredientListResSchema) {}
export class skuRecipeIngredientParamsDTO extends createZodDto(skuRecipeIngredientParamsSchema) {}
