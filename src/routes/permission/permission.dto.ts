import { createZodDto } from 'nestjs-zod'
import {
  GetListPermissionQuerySchema,
  GetListPermissionsResSchema,
  getParamsPermissionSchema,
  PermissionBodyResSchema,
  PermissionBodySchema,
  PermissionIncludeCreateByAndUpdateBySchema,
} from './permission.model'
import { PermissionSchema } from '@/shared/models/shared-permission.model'

export class PermissionBodyDTO extends createZodDto(PermissionBodySchema) {}
export class PermissionBodyResDTO extends createZodDto(PermissionSchema) {}
export class GetParamsPermissionDTO extends createZodDto(getParamsPermissionSchema) {}
export class PermissionIncludeCreateByAndUpdateByDTO extends createZodDto(PermissionIncludeCreateByAndUpdateBySchema) {}
export class GetListPermissionsResDTO extends createZodDto(GetListPermissionsResSchema) {}
export class GetListPermissionQueryDTO extends createZodDto(GetListPermissionQuerySchema) {}
