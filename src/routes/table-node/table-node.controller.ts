import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { TableNodeService } from './table-node.service'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  ListTableNodeResDTO,
  TableNodeBodyDTO,
  TableNodeDetailResDTO,
  TableNodeParamsDTO,
  TableNodeQueryDTO,
  TableNodeResDTO,
  UpdateTableNodeBodyDTO,
  UpdateTableNodeBodyBatchDTO,
  UpdateTableNodeBodyBatchResDTO,
} from '@/routes/table-node/table-node.dtos'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { EmptyBodyDTO } from '@/shared/dtos/respone.dto'

@Controller('table-node')
export class TableNodeController {
  constructor(private readonly tableNodeService: TableNodeService) {}

  @Post()
  @ZodSerializerDto(TableNodeResDTO)
  async create(@Body() data: TableNodeBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.tableNodeService.create({ data, createdById: userId })
  }
  @Get()
  @ZodSerializerDto(ListTableNodeResDTO)
  async getList(@Body() data: EmptyBodyDTO, @Query() query: TableNodeQueryDTO, @ActiveUser('userId') userId: number) {
    return await this.tableNodeService.getList(query, userId)
  }

  @Get(':id')
  @ZodSerializerDto(TableNodeDetailResDTO)
  async getTableNodeById(@Param() params: TableNodeParamsDTO) {
    return await this.tableNodeService.getTableNodeById(params.id)
  }

  @Put(':id')
  @ZodSerializerDto(TableNodeResDTO)
  async update(
    @Param() params: TableNodeParamsDTO,
    @Body() data: UpdateTableNodeBodyDTO,
    @ActiveUser('userId') updatedById: number,
  ) {
    return await this.tableNodeService.UpdateTableNode(params.id, { data, updatedById })
  }

  @Put('updateMany/batch')
  @ZodSerializerDto(UpdateTableNodeBodyBatchResDTO)
  async updateBatch(@Body() data: UpdateTableNodeBodyBatchDTO, @ActiveUser('userId') updatedById: number) {
    const controller = await this.tableNodeService.updateBatch(data, updatedById)
    return controller
  }

  @Delete(':id')
  @ZodSerializerDto(TableNodeResDTO)
  async delete(@Param() params: TableNodeParamsDTO, @ActiveUser('userId') deletedById: number) {
    return await this.tableNodeService.delete({ TableNodeId: params.id, deletedById })
  }

  @Delete('area/:areaId')
  async deleteAllByArea(@Param('areaId') areaId: number) {
    return await this.tableNodeService.deleteAllByArea(+areaId)
  }
}
