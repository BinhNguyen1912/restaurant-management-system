import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { CategoryTranslationService } from './category-translation.service'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  CategoryTranslationBodyDTO,
  CategoryTranslationResDTO,
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
