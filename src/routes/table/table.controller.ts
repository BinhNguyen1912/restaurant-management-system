import {
  CreateTableBodyDTO,
  TableDetailResDTO,
  TableListResDTO,
  TableParamsDTO,
  UpdateTableBodyDTO,
} from '@/routes/table/table.dtos'
import { TableService } from '@/routes/table/table.service'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { ActiveRole } from '@/shared/decorators/active-role.decorator'
import { EmptyBodyDTO } from '@/shared/dtos/respone.dto'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('tables')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Post()
  @ZodSerializerDto(TableDetailResDTO)
  async createTable(@Body() body: CreateTableBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.tableService.create(body, userId)
  }

  @Get()
  @ZodSerializerDto(TableListResDTO)
  async getListTable(@ActiveUser('userId') userId: number, @ActiveRole('name') roleName: string) {
    return await this.tableService.getListTable(userId, roleName)
  }

  @Get('/getTableDetail/:number')
  @ZodSerializerDto(TableDetailResDTO)
  async getTableDetail(@Param() param: TableParamsDTO) {
    return await this.tableService.getTableDetail(param.number)
  }

  // @Put(':number')
  // @ZodSerializerDto(TableDetailResDTO)
  // async updateTable(
  //   @Body() body: UpdateTableBodyDTO,
  //   @ActiveUser('userId') userId: number,
  //   @Param() param: TableParamsDTO,
  // ) {
  //   return await this.tableService.update(param.number, body, userId)
  // }

  // @Delete(':number')
  // @ZodSerializerDto(TableDetailResDTO)
  // async deleteTable(@Param() param: TableParamsDTO, @ActiveUser('userId') userId: number) {
  //   return await this.tableService.delete(param.number, userId)
  // }
}
