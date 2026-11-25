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
import { LocaleParam } from '@/shared/decorators/locale.decorator'
import { Locale } from '@/shared/i18n/locale'

@SkipThrottle()
@Controller('product')
@IsPublic()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('/detail/:productId')
  @ZodSerializerDto(GetProductDetailResDTO)
  async findById(@Param() param: GetProductParamDTO, @LocaleParam() locale: Locale) {
    return this.productService.getDetail({ productId: param.productId, locale })
  }

  @Get()
  @ZodSerializerDto(GetProductsResDTO)
  async getList(@Query() query: GetProductQueryDTO, @LocaleParam() locale: Locale) {
    const list = await this.productService.list({ query, locale })
    return list
  }
}
