import { GetAllUnitResDTO, UnitBodyDTO, unitParamsDTO, UnitResDTO } from '@/routes/unit/unit.dtos'
import { UnitService } from '@/routes/unit/unit.service'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { EmptyBodyDTO } from '@/shared/dtos/respone.dto'
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('unit')
export class UnitController {
  constructor(private readonly unitService: UnitService) {}
  @Post()
  @ZodSerializerDto(UnitResDTO)
  async create(@Body() body: UnitBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.unitService.create(body, userId)
  }

  @Get()
  @ZodSerializerDto(GetAllUnitResDTO)
  async getAll(@Body() body: EmptyBodyDTO) {
    return await this.unitService.findAll()
  }

  @Patch(':id')
  @ZodSerializerDto(UnitResDTO)
  async update(@Body() body: UnitBodyDTO, @Param() params: unitParamsDTO, @ActiveUser('userId') userId: number) {
    return await this.unitService.update({ name: params.name }, body, userId)
  }
  @Delete(':id')
  async delete(@Param() params: unitParamsDTO, @ActiveUser('userId') userId: number) {
    return await this.unitService.delete({ name: params.name }, userId)
  }
}
