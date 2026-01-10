import { PermissionSchema, PermissionType } from '@/shared/models/shared-permission.model'
import { PaginationQuerySchema } from '@/shared/models/request.model'
import z from 'zod'

export const PermissionBodySchema = PermissionSchema.pick({
  name: true,
  description: true,
  path: true,
  method: true,
  module: true,
})

export const PermissionIncludeCreateByAndUpdateBySchema = PermissionSchema.extend({
  createdBy: z
    .object({
      id: z.number(),
      name: z.string(),
    })
    .nullable(),
  updatedBy: z
    .object({
      id: z.number(),
      name: z.string(),
    })
    .nullable(),
})

export const GetListPermissionQuerySchema = PaginationQuerySchema
export const GetListPermissionsResSchema = z.object({
  data: z.array(PermissionSchema),
  totalItem: z.number(),
  totalPage: z.number(),
  page: z.number().nullable(),
  limit: z.number().nullable(),
})

export const getParamsPermissionSchema = z.object({
  id: z.coerce.number(),
})
export const PermissionBodyResSchema = PermissionSchema
export type GetParamsPermissionType = z.infer<typeof getParamsPermissionSchema>
export type PermissionBodyType = z.infer<typeof PermissionBodySchema>
export type PermissionBodyResType = PermissionType
export type PermissionIncludeCreateByAndUpdateByType = z.infer<typeof PermissionIncludeCreateByAndUpdateBySchema>
export type GetListPermissionQueryType = z.infer<typeof GetListPermissionQuerySchema>
export type GetListPermissionsResType = z.infer<typeof GetListPermissionsResSchema>
