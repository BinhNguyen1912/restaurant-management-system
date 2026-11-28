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
  RolePermissionMatrixResDTO,
  RoleTypeDTO,
  UpdateRoleBodyDTO,
  UpdateRolePermissionsBodyDTO,
} from '@/routes/role/role.dto'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { ActiveRole } from '@/shared/decorators/active-role.decorator'
import { MessageResDto } from '@/shared/dtos/respone.dto'
import { RequireStepUp } from '@/shared/decorators/step-up.decorator'

@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @RequireStepUp()
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

  /** Ma trận quyền (mọi route + đã cấp hay chưa) — ADMIN sửa được màn hình này */
  @Get(':id/permissions')
  @ZodSerializerDto(RolePermissionMatrixResDTO)
  async getPermissions(@Param() params: GetRoleParamsDTO) {
    return await this.roleService.getPermissionMatrix(params.id)
  }

  /** Ghi đè toàn bộ quyền của role; ADMIN bị khoá (luôn full quyền) */
  @Put(':id/permissions')
  @RequireStepUp()
  async updatePermissions(
    @Param() params: GetRoleParamsDTO,
    @Body() body: UpdateRolePermissionsBodyDTO,
    @ActiveUser('userId') userId: number,
    @ActiveRole('name') roleName: string,
  ) {
    // actorId/actorRole là thứ duy nhất trả lời được "ai đã cấp quyền này" về sau
    return await this.roleService.updatePermissions(params.id, body.permissionIds, { userId, roleName })
  }

  @Put(':id')
  @RequireStepUp()
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
  @RequireStepUp()
  @ZodSerializerDto(MessageResDto)
  async delete(@Param() param: GetRoleParamsDTO) {
    return await this.roleService.delete(param.id)
  }
}
