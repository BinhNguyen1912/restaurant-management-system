import { createZodDto } from 'nestjs-zod'
import {
  CategoryBodySchema,
  getAllCategorySchema,
  getCategoryDetailSchema,
  getCategoryParamSchema,
  getCatoryriesQuerySchema,
  UpdateCategoryBodySchema,
} from './category.model'
import { CategorySchema } from '@/shared/models/shared-category.model'

export class CategoryBodyDTO extends createZodDto(CategoryBodySchema) {}
export class CategoryResDTO extends createZodDto(CategorySchema) {}
export class getCategoryParamDTO extends createZodDto(getCategoryParamSchema) {}
export class getCategoryDetailDTO extends createZodDto(getCategoryDetailSchema) {}
export class UpdateCategoryBodyDTO extends createZodDto(UpdateCategoryBodySchema) {}
export class getAllCategoryDTO extends createZodDto(getAllCategorySchema) {}
export class GetCategoryQueryDTO extends createZodDto(getCatoryriesQuerySchema) {}
