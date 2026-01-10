import { HTTPMethod } from '@/shared/constants/role.constant'
import { RoleSchema } from '@/shared/models/shared-role.model'
import { z } from 'zod'

export const PermissionSchema = z.object({
  id: z.number(),
  name: z
    .string({ message: 'Error.NameMustBeString' })
    .min(3, { message: 'Error.TooShort' })
    .max(50, { message: 'Error.TooLong' }),
  description: z.string({ message: 'Error.DescriptionMustBeString' }).optional(),
  path: z.string({ message: 'Error.PathMustBeString' }),
  method: z.nativeEnum(HTTPMethod),
  module: z.string({ message: 'Error.ModuleMustBeString' }).max(100),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
})
export const PermissionWithRolesType = PermissionSchema.extend({
  roles: RoleSchema,
})
export type PermissionType = z.infer<typeof PermissionSchema>
export type PermissionWithRolesType = z.infer<typeof PermissionWithRolesType>
