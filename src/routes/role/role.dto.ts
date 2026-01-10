import {
  getRoleParamsSchema,
  getRoleQuerySchema,
  GetRolesResSchema,
  GetRoleWithPermissonResSchema,
  RoleBodyResSchema,
  RoleBodySchema,
  updateRoleBodySchema,
} from '@/routes/role/role.model'
import { RoleSchema } from '@/shared/models/shared-role.model'
import { createZodDto } from 'nestjs-zod'

export class RoleBodyDTO extends createZodDto(RoleBodySchema) {}
export class RoleBodyResDTO extends createZodDto(RoleBodyResSchema) {}
export class GetRoleQueryDTO extends createZodDto(getRoleQuerySchema) {}
export class GetRolesResDTO extends createZodDto(GetRolesResSchema) {}
export class GetRoleParamsDTO extends createZodDto(getRoleParamsSchema) {}
export class GetRoleWithPermissonResDTO extends createZodDto(GetRoleWithPermissonResSchema) {}
export class UpdateRoleBodyDTO extends createZodDto(updateRoleBodySchema) {}
export class RoleTypeDTO extends createZodDto(RoleSchema) {}
