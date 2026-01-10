import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { CategoryService } from './category.service'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  CategoryBodyDTO,
  CategoryResDTO,
  getAllCategoryDTO,
  getCategoryDetailDTO,
  getCategoryParamDTO,
  GetCategoryQueryDTO,
  UpdateCategoryBodyDTO,
} from '@/routes/categories/category.dtos'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  //   @ZodSerializerDto(CategoryResDTO)
  async create(@Body() body: CategoryBodyDTO, @ActiveUser('userId') userId: number) {
    const data = await this.categoryService.create({ body, createdById: userId })
    return data
  }

  @Get(':parentCategoryId')
  @ZodSerializerDto(getCategoryDetailDTO)
  async findUnique(@Param() param: getCategoryParamDTO) {
    const resuft = await this.categoryService.findUnique(param.parentCategoryId)
    return resuft
  }

  @Put(':parentCategoryId')
  @ZodSerializerDto(getCategoryDetailDTO)
  async update(
    @Param() param: getCategoryParamDTO,
    @Body() body: UpdateCategoryBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return await this.categoryService.update({ id: param.parentCategoryId, data: body, updatedById: userId })
  }

  @Delete(':parentCategoryId')
  async delete(@Param() param: getCategoryParamDTO, @ActiveUser('userId') userId: number) {
    return await this.categoryService.delete({ id: param.parentCategoryId, deletedById: userId })
  }

  @Get()
  @ZodSerializerDto(getAllCategoryDTO)
  async getAll(@Query() query: GetCategoryQueryDTO) {
    return await this.categoryService.getAll(query.parentCategoryId)
  }
}
