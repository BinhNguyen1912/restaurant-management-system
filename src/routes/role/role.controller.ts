import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { RoleService } from './role.service'

import {
  GetRoleQueryType,
  GetRolesResSchema,
  GetRoleWithPermissonResSchema,
  RoleBodyResSchema,
  RoleBodySchema,
  UpdateRoleBodyType,
} from './role.model'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  GetRoleParamsDTO,
  GetRoleQueryDTO,
  GetRolesResDTO,
  GetRoleWithPermissonResDTO,
  RoleBodyDTO,
  RoleBodyResDTO,
  RoleTypeDTO,
  UpdateRoleBodyDTO,
} from '@/routes/role/role.dto'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { MessageResDto } from '@/shared/dtos/respone.dto'

@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @ZodSerializerDto(RoleBodyResDTO)
  async create(@Body() body: RoleBodyDTO, @ActiveUser('userId') userId: number) {
    const result = await this.roleService.create({ ...body, createdById: userId })
    return result
  }

  @Get('')
  @ZodSerializerDto(GetRolesResDTO)
  async getListRoles(@Query() query: GetRoleQueryDTO) {
    const result = await this.roleService.getListRole(query)
    return result
  }

  @Get(':id')
  @ZodSerializerDto(GetRoleWithPermissonResDTO)
  async getRoleById(@Param() params: GetRoleParamsDTO) {
    const result = await this.roleService.findById(params.id)
    return result
  }

  @Put(':id')
  @ZodSerializerDto(RoleTypeDTO)
  async update(
    @Param() param: GetRoleParamsDTO,
    @Body() body: UpdateRoleBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    const resuft = await this.roleService.update({ data: body, id: param.id, updatedById: userId })
    return resuft
  }

  @Delete(':id')
  @ZodSerializerDto(MessageResDto)
  async delete(@Param() param: GetRoleParamsDTO) {
    return await this.roleService.delete(param.id)
  }
}
