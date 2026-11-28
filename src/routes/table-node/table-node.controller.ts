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
import { ActiveRole } from '@/shared/decorators/active-role.decorator'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
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
  async getList(@Body() data: EmptyBodyDTO, @Query() query: TableNodeQueryDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.tableNodeService.getList(query, user)
  }

  @Get(':id')
  @ZodSerializerDto(TableNodeDetailResDTO)
  async getTableNodeById(@Param() params: TableNodeParamsDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.tableNodeService.getTableNodeById(params.id, user)
  }

  @Put(':id')
  @ZodSerializerDto(TableNodeResDTO)
  async update(
    @Param() params: TableNodeParamsDTO,
    @Body() data: UpdateTableNodeBodyDTO,
    @ActiveUser('userId') updatedById: number,
    @ActiveRole('name') roleName: string,
  ) {
    return await this.tableNodeService.UpdateTableNode(params.id, { data, updatedById, actor: { userId: updatedById, roleName } })
  }

  @Put('updateMany/batch')
  @ZodSerializerDto(UpdateTableNodeBodyBatchResDTO)
  async updateBatch(
    @Body() data: UpdateTableNodeBodyBatchDTO,
    @ActiveUser('userId') updatedById: number,
    @ActiveRole('name') roleName: string,
  ) {
    const controller = await this.tableNodeService.updateBatch(data, updatedById, { userId: updatedById, roleName })
    return controller
  }

  /** Mở bàn: khách chỉ quét QR gọi món được khi bàn đang mở */
  @Post(':id/open')
  async open(
    @Param() params: TableNodeParamsDTO,
    @ActiveUser('userId') userId: number,
    @ActiveRole('name') roleName: string,
  ) {
    return await this.tableNodeService.openTable(params.id, userId, { userId, roleName })
  }

  /** Đóng bàn: trả bàn về trống, kết thúc phiên của khách */
  @Post(':id/close')
  async close(
    @Param() params: TableNodeParamsDTO,
    @ActiveUser('userId') userId: number,
    @ActiveRole('name') roleName: string,
  ) {
    return await this.tableNodeService.closeTable(params.id, userId, { userId, roleName })
  }

  @Delete(':id')
  @ZodSerializerDto(TableNodeResDTO)
  async delete(
    @Param() params: TableNodeParamsDTO,
    @ActiveUser('userId') deletedById: number,
    @ActiveRole('name') roleName: string,
  ) {
    return await this.tableNodeService.delete({ TableNodeId: params.id, deletedById, actor: { userId: deletedById, roleName } })
  }

  @Delete('area/:areaId')
  async deleteAllByArea(
    @Param('areaId') areaId: number,
    @ActiveUser('userId') userId: number,
    @ActiveRole('name') roleName: string,
  ) {
    return await this.tableNodeService.deleteAllByArea(+areaId, { userId, roleName })
  }
}
