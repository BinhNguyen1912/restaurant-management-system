import { PermissionSchema } from '@/shared/models/shared-permission.model'
import { z } from 'zod'
const REQUEST_ROLE_KEY = 'role'
export const RoleSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  isActive: z.boolean(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export const RolePermissionsShema = RoleSchema.extend({
  permission: z.array(PermissionSchema),
})
export type RoleType = z.infer<typeof RoleSchema>
export type RolePermissionsType = z.infer<typeof RolePermissionsShema>
