import {
  CreateProductBodySchema,
  GetManageProductQuerySchema,
  GetProductDetailSchema,
  GetProductParamSchema,
  GetProductQuerySchema,
  GetProductsResSchema,
  UpdateProductBodySchema,
} from '@/routes/products/product.model'
import { createZodDto } from 'nestjs-zod'

export class CreateProductBodyDTO extends createZodDto(CreateProductBodySchema) {}

export class UpdateProductBodyDTO extends createZodDto(UpdateProductBodySchema) {}

export class GetProductParamDTO extends createZodDto(GetProductParamSchema) {}

export class GetProductQueryDTO extends createZodDto(GetProductQuerySchema) {}

export class GetManageQueryDTO extends createZodDto(GetManageProductQuerySchema) {}

export class GetProductDetailResDTO extends createZodDto(GetProductDetailSchema) {}

export class GetProductsResDTO extends createZodDto(GetProductsResSchema) {}
