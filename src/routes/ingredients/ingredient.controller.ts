import {
  CreateIngredientBodyDTO,
  GetAllIngredientDTO,
  GetIngredientDetailDTO,
  GetIngredientParamDTO,
  GetIngredientQueryDTO,
  IngredientResDTO,
  UpdateIngredientBodyDTO,
} from '@/routes/ingredients/ingredient.dtos'
import { IngredientService } from '@/routes/ingredients/ingredient.service'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { MessageResDto } from '@/shared/dtos/respone.dto'
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('ingredients')
export class IngredientController {
  constructor(private readonly ingredientService: IngredientService) {}

  @Post()
  @ZodSerializerDto(IngredientResDTO)
  async createTable(@Body() body: CreateIngredientBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.ingredientService.create({ body, createdById: userId })
  }

  @Get()
  @ZodSerializerDto(GetAllIngredientDTO)
  async getListTable(@Query() query: GetIngredientQueryDTO) {
    return await this.ingredientService.getAll({
      query,
    })
  }

  @Get('getIngredientDetail/:id')
  @ZodSerializerDto(IngredientResDTO)
  async getTableDetail(@Param() param: GetIngredientParamDTO) {
    return await this.ingredientService.findUnique(param.id)
  }

  @Put('update/:id')
  @ZodSerializerDto(IngredientResDTO)
  async updateTable(
    @Body() body: UpdateIngredientBodyDTO,
    @ActiveUser('userId') userId: number,
    @Param() param: GetIngredientParamDTO,
  ) {
    return await this.ingredientService.update({ data: body, id: param.id, updatedById: userId })
  }

  @Delete(':id')
  @ZodSerializerDto(IngredientResDTO)
  async deleteTable(@Param() param: GetIngredientParamDTO, @ActiveUser('userId') userId: number) {
    return await this.ingredientService.delete({ id: param.id, deletedById: userId })
  }
}
