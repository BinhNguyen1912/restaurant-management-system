import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { AreaService } from './area.service'
import {
  AreaBodyDTO,
  AreaParamsDTO,
  AreaQueryDTO,
  AreaResDTO,
  ListAreaResDTO,
  UpdateAreaBodyDTO,
} from '@/routes/area/area.dtos'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { ZodSerializerDto } from 'nestjs-zod'
import { EmptyBodyDTO } from '@/shared/dtos/respone.dto'
import { getListAreaResSchema } from '@/routes/area/area.model'

@Controller('area')
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @Post()
  @ZodSerializerDto(AreaResDTO)
  async create(@Body() data: AreaBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.areaService.create({ data, createdById: userId })
  }
  @Get()
  @ZodSerializerDto(ListAreaResDTO)
  async getList(@Body() data: EmptyBodyDTO, @Query() query: AreaQueryDTO) {
    return await this.areaService.getList(query)
  }

  @Get(':id')
  @ZodSerializerDto(AreaResDTO)
  async getAreaById(@Param() params: AreaParamsDTO) {
    return await this.areaService.getAreaById(params.id)
  }

  @Put(':id')
  @ZodSerializerDto(AreaResDTO)
  async update(
    @Param() params: AreaParamsDTO,
    @Body() data: UpdateAreaBodyDTO,
    @ActiveUser('userId') updatedById: number,
  ) {
    return await this.areaService.UpdateAreaById(params.id, { data, updatedById })
  }

  @Delete(':id')
  @ZodSerializerDto(AreaResDTO)
  async delete(@Param() params: AreaParamsDTO, @ActiveUser('userId') deletedById: number) {
    return await this.areaService.delete({ areaId: params.id, deletedById })
  }
}
