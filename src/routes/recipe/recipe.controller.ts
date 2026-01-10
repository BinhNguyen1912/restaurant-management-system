import { GetIngredientQueryDTO } from '@/routes/ingredients/ingredient.dtos'
import { IngredientService } from '@/routes/ingredients/ingredient.service'
import {
  SkuRecipeIngredientBodyDTO,
  SkuRecipeIngredientListResDTO,
  skuRecipeIngredientParamsDTO,
  SkuRecipeIngredientResDTO,
} from '@/routes/recipe/recipe.dtos'
import { RecipeService } from '@/routes/recipe/recipe.service'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { PagitionQueryDTO } from '@/shared/dtos/request.dto'
import { MessageResDto } from '@/shared/dtos/respone.dto'
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('recipes')
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  @Post()
  @ZodSerializerDto(SkuRecipeIngredientResDTO)
  async creatSkuRecipeIngredient(@Body() body: SkuRecipeIngredientBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.recipeService.create({ body, createdById: userId })
  }

  @Get()
  @ZodSerializerDto(SkuRecipeIngredientListResDTO)
  async getListTable(@Query() query: PagitionQueryDTO) {
    return await this.recipeService.getAll(query)
  }

  @Get('/:skuId')
  @ZodSerializerDto(SkuRecipeIngredientResDTO)
  async getRecipeIngredientDetail(@Param() param: skuRecipeIngredientParamsDTO) {
    return await this.recipeService.findUnique(+param.skuId)
  }

  @Put()
  @ZodSerializerDto(SkuRecipeIngredientResDTO)
  async updateTable(@Body() body: SkuRecipeIngredientBodyDTO, @ActiveUser('userId') updatedById: number) {
    return await this.recipeService.update({
      body,
      updatedById,
    })
  }

  @Delete(':skuId')
  @ZodSerializerDto(MessageResDto)
  async deleteTable(@Param() param: skuRecipeIngredientParamsDTO, @ActiveUser('userId') userId: number) {
    return await this.recipeService.delete({ skuId: +param.skuId, deletedById: userId })
  }
}
