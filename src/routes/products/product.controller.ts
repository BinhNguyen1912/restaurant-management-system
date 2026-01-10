import { Controller, Get, Param, Query } from '@nestjs/common'
import { ProductService } from './product.service'
import { ZodSerializerDto } from 'nestjs-zod'
import { GetProductsResSchema } from './product.model'
import { IsPublic } from '@/shared/decorators/auth.decorator'
import {
  GetProductDetailResDTO,
  GetProductParamDTO,
  GetProductQueryDTO,
  GetProductsResDTO,
} from '@/routes/products/product.dtos'
import { SkipThrottle } from '@nestjs/throttler'

@SkipThrottle()
@Controller('product')
@IsPublic()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('/detail/:productId')
  @ZodSerializerDto(GetProductDetailResDTO)
  async findById(@Param() param: GetProductParamDTO) {
    return this.productService.getDetail({ productId: param.productId })
  }

  @Get()
  @ZodSerializerDto(GetProductsResDTO)
  async getList(@Query() query: GetProductQueryDTO) {
    const list = await this.productService.list({ query })
    return list
  }
}
