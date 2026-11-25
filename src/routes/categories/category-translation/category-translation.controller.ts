import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CategoryTranslationService } from './category-translation.service'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  CategoryTranslationBodyDTO,
  CategoryTranslationListResDTO,
  CategoryTranslationResDTO,
  GetCategoryTranslationsQueryDTO,
  GetCategoryTranslationParamDTO,
  UpdateCategoryTranslationBodyDTO,
} from './category-translation.dto'
import { MessageResDto } from '@/shared/dtos/respone.dto'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'

@Controller('category-translation')
export class CategoryTranslationController {
  constructor(private readonly categoryTranslationService: CategoryTranslationService) {}

  @Post()
  @ZodSerializerDto(CategoryTranslationResDTO)
  async create(@Body() body: CategoryTranslationBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.categoryTranslationService.create({ body, createdById: userId })
  }

  /** Phải khai báo TRƯỚC route ':id' để không bị nuốt bởi param */
  @Get()
  @ZodSerializerDto(CategoryTranslationListResDTO)
  async list(@Query() query: GetCategoryTranslationsQueryDTO) {
    return await this.categoryTranslationService.listByCategory(query.categoryId)
  }

  @Get(':categoryTranslationId')
  @ZodSerializerDto(CategoryTranslationResDTO)
  async findUnique(@Param() param: GetCategoryTranslationParamDTO) {
    return await this.categoryTranslationService.findUnique(param.categoryTranslationId)
  }

  @Patch(':categoryTranslationId')
  @ZodSerializerDto(CategoryTranslationResDTO)
  async update(
    @Param() param: GetCategoryTranslationParamDTO,
    @Body() body: UpdateCategoryTranslationBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return await this.categoryTranslationService.update({
      data: body,
      id: param.categoryTranslationId,
      updatedById: userId,
    })
  }
  @Delete(':categoryTranslationId')
  @ZodSerializerDto(MessageResDto)
  async delete(@Param() param: GetCategoryTranslationParamDTO, @ActiveUser('userId') userId: number) {
    return await this.categoryTranslationService.delete({ id: param.categoryTranslationId, deletedById: userId })
  }
}
