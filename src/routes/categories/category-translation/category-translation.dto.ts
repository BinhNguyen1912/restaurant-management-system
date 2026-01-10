import { createZodDto } from 'nestjs-zod'
import {
  CategoryTranslationBodySchema,
  CategoryTranslationResSchema,
  getCategoryTranslationParamSchema,
} from './category-translation.model'
import { UpdateCategoryBodySchema } from '../category.model'

export class CategoryTranslationBodyDTO extends createZodDto(CategoryTranslationBodySchema) {}

export class UpdateCategoryTranslationBodyDTO extends createZodDto(UpdateCategoryBodySchema) {}

export class GetCategoryTranslationParamDTO extends createZodDto(getCategoryTranslationParamSchema) {}

export class CategoryTranslationResDTO extends createZodDto(CategoryTranslationResSchema) {}
