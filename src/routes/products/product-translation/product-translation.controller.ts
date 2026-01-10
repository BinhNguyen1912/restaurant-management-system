import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ProductTranslationService } from './product-translation.service'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  ProductTranslationBodyDTO,
  ProductTranslationParamDTO,
  ProductTranslationResDTO,
  UpdateProductTranslationBodyDTO,
} from './product-translation.dto'
import { Product } from '@prisma/client'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { MessageResDto } from '@/shared/dtos/respone.dto'

@Controller('product-translation')
export class ProductTranslationController {
  constructor(private readonly productTranslationService: ProductTranslationService) {}

  @Post()
  @ZodSerializerDto(ProductTranslationResDTO)
  async create(@Body() body: ProductTranslationBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.productTranslationService.create({ body, createdById: userId })
  }

  @Get(':productTranslationId')
  @ZodSerializerDto(ProductTranslationResDTO)
  async findUnique(@Param() param: ProductTranslationParamDTO) {
    return await this.productTranslationService.findUnique(param.productTranslationId)
  }

  @Patch(':productTranslationId')
  @ZodSerializerDto(ProductTranslationResDTO)
  async update(
    @Param() param: ProductTranslationParamDTO,
    @Body() body: UpdateProductTranslationBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return await this.productTranslationService.update({
      data: body,
      id: param.productTranslationId,
      updatedById: userId,
    })
  }
  @Delete(':productTranslationId')
  @ZodSerializerDto(MessageResDto)
  async delete(@Param() param: ProductTranslationParamDTO, @ActiveUser('userId') userId: number) {
    return await this.productTranslationService.delete({ id: param.productTranslationId, deletedById: userId })
  }
}
