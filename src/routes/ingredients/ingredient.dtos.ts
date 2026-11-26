import {
  getAllIngredientResSchema,
  getIngredientDetailResSchema,
  ingredientBodySchema,
  ingredientParamsSchema,
  ingredientQuerySchema,
  ingredientResSchema,
  updateIngredientBodySchema,
  CreateStockReceiptResSchema,
  CreateStockReceiptSchema,
  StockReceiptListResSchema,
} from '@/routes/ingredients/ingredient.model'
import { createZodDto } from 'nestjs-zod'

export class CreateIngredientBodyDTO extends createZodDto(ingredientBodySchema) {}
export class IngredientResDTO extends createZodDto(ingredientResSchema) {}
export class GetIngredientParamDTO extends createZodDto(ingredientParamsSchema) {}
export class GetIngredientDetailDTO extends createZodDto(getIngredientDetailResSchema) {}
export class UpdateIngredientBodyDTO extends createZodDto(updateIngredientBodySchema) {}
export class GetAllIngredientDTO extends createZodDto(getAllIngredientResSchema) {}
export class GetIngredientQueryDTO extends createZodDto(ingredientQuerySchema) {}

export class CreateStockReceiptDTO extends createZodDto(CreateStockReceiptSchema) {}
export class CreateStockReceiptResDTO extends createZodDto(CreateStockReceiptResSchema) {}
export class StockReceiptListResDTO extends createZodDto(StockReceiptListResSchema) {}
