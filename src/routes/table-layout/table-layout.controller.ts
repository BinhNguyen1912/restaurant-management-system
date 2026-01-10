import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { TableLayoutService } from './table-layout.service'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  ListTableLayoutResDTO,
  TableLayoutBodyDTO,
  TableLayoutDetailResDTO,
  TableLayoutParamsDTO,
  TableLayoutQueryDTO,
  TableLayoutResDTO,
  UpdateTableLayoutBodyDTO,
} from '@/routes/table-layout/table-layout.dtos'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { EmptyBodyDTO } from '@/shared/dtos/respone.dto'

@Controller('table-layout')
export class TableLayoutController {
  constructor(private readonly tableLayoutService: TableLayoutService) {}

  @Post()
  @ZodSerializerDto(TableLayoutResDTO)
  async create(@Body() data: TableLayoutBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.tableLayoutService.create({ data, createdById: userId })
  }
  @Get()
  @ZodSerializerDto(ListTableLayoutResDTO)
  async getList(@Body() data: EmptyBodyDTO, @Query() query: TableLayoutQueryDTO) {
    return await this.tableLayoutService.getList(query)
  }

  @Get(':id')
  @ZodSerializerDto(TableLayoutDetailResDTO)
  async getTableLayoutById(@Param() params: TableLayoutParamsDTO) {
    return await this.tableLayoutService.getTableLayoutById(params.id)
  }

  @Put(':id')
  @ZodSerializerDto(TableLayoutResDTO)
  async update(
    @Param() params: TableLayoutParamsDTO,
    @Body() data: UpdateTableLayoutBodyDTO,
    @ActiveUser('userId') updatedById: number,
  ) {
    return await this.tableLayoutService.UpdateTableLayoutById(params.id, { data, updatedById })
  }

  @Delete(':id')
  @ZodSerializerDto(TableLayoutResDTO)
  async delete(@Param() params: TableLayoutParamsDTO, @ActiveUser('userId') deletedById: number) {
    return await this.tableLayoutService.delete({ TableLayoutId: params.id, deletedById })
  }
}
