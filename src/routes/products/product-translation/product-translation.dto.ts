import { createZodDto } from 'nestjs-zod'
import {
  getProductTranslationDetailResSchema,
  getProductTranslationParamSchema,
  ProductTranslationBodySchema,
  UpdateProductTranslationBodySchema,
} from './product-translation.model'

export class ProductTranslationBodyDTO extends createZodDto(ProductTranslationBodySchema) {}

export class UpdateProductTranslationBodyDTO extends createZodDto(UpdateProductTranslationBodySchema) {}

export class ProductTranslationParamDTO extends createZodDto(getProductTranslationParamSchema) {}

export class ProductTranslationResDTO extends createZodDto(getProductTranslationDetailResSchema) {}
