import {
  GetAllUnitConversionResDTO,
  UnitConversionBodyDTO,
  unitConversionParamsDTO,
  UnitConversionResDTO,
} from '@/routes/unitConversion/unitConversion.dtos'
import { UnitConversionService } from '@/routes/unitConversion/unitConversion.service'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { EmptyBodyDTO } from '@/shared/dtos/respone.dto'
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('unit-conversion')
export class UnitConversionController {
  constructor(private readonly unitConversionService: UnitConversionService) {}
  @Post()
  @ZodSerializerDto(UnitConversionResDTO)
  async create(@Body() body: UnitConversionBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.unitConversionService.create(body, userId)
  }

  @Get()
  @ZodSerializerDto(GetAllUnitConversionResDTO)
  async getAll(@Body() body: EmptyBodyDTO) {
    return await this.unitConversionService.findAll()
  }

  @Patch(':id')
  @ZodSerializerDto(UnitConversionResDTO)
  async update(
    @Body() body: UnitConversionBodyDTO,
    @Param() params: unitConversionParamsDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return await this.unitConversionService.update({ id: params.id }, body, userId)
  }
  @Delete(':id')
  async delete(@Param() params: unitConversionParamsDTO, @ActiveUser('userId') userId: number) {
    return await this.unitConversionService.delete({ id: params.id }, userId)
  }
}
