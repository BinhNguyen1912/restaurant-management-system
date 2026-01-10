import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common'
import { PermissionService } from './permission.service'
import {
  GetListPermissionQueryDTO,
  GetListPermissionsResDTO,
  GetParamsPermissionDTO,
  PermissionBodyDTO,
  PermissionBodyResDTO,
  PermissionIncludeCreateByAndUpdateByDTO,
} from './permission.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { PermissionBodyResSchema } from './permission.model'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'

@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post()
  @ZodSerializerDto(PermissionBodyResDTO)
  create(@Body() body: PermissionBodyDTO, @ActiveUser('userId') userId: number) {
    return this.permissionService.create({ ...body, createdById: userId })
  }

  @Get('getListPermission')
  @ZodSerializerDto(GetListPermissionsResDTO)
  findAll(@Query() query: GetListPermissionQueryDTO) {
    return this.permissionService.findAll(query)
  }

  @Get(':id')
  @ZodSerializerDto(PermissionIncludeCreateByAndUpdateByDTO)
  findOne(@Param() param: GetParamsPermissionDTO) {
    return this.permissionService.findOne(param)
  }

  @Patch(':id')
  @ZodSerializerDto(PermissionBodyResDTO)
  async update(
    @Param() param: GetParamsPermissionDTO,
    @Body() body: Partial<PermissionBodyDTO>,
    @ActiveUser('userId') userId: number,
  ) {
    return await this.permissionService.update({ data: body, id: param.id, updatedById: userId })
  }
  @Delete(':id')
  async remove(@Param() param: GetParamsPermissionDTO, @ActiveUser('userId') userId: number) {
    return await this.permissionService.remove({ id: param.id, userId })
  }
}
