import { PermissionSchema } from '@/shared/models/shared-permission.model'
import { RoleSchema } from '@/shared/models/shared-role.model'
import z from 'zod'

export const RoleBodySchema = RoleSchema.pick({
  name: true,
  description: true,
  isActive: true,
}).strict()
export const RoleBodyResSchema = RoleSchema

export const GetRoleWithPermissonResSchema = RoleSchema.extend({
  permissions: z.array(PermissionSchema),
})
export const GetRolesResSchema = z.object({
  data: z.array(RoleSchema),
  totalItems: z.number(),
  totalPages: z.number(),
  page: z.number(),
  limit: z.number(),
})

//z.coerce giúp bạn chấp nhận đầu vào là string, number, Date... và tự ép về kiểu đúng.
//.positive()	Ràng buộc: phải là số dương (> 0)
export const getRoleQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().default(10),
  })
  .strict()
/**
 * Ma trận phân quyền: mỗi route (method + path + module) kèm cờ `granted` cho role đang xét.
 * Trả về **toàn bộ** route chứ không chỉ route đã cấp — màn hình cần biết cái gì đang tắt để bật.
 */
export const RolePermissionMatrixResSchema = z.object({
  message: z.string(),
  data: z.object({
    role: z.object({ id: z.number(), name: z.string(), isLocked: z.boolean() }),
    permissions: z.array(
      z.object({
        id: z.number(),
        method: z.string(),
        path: z.string(),
        module: z.string(),
        granted: z.boolean(),
      }),
    ),
  }),
})

/** Gửi DANH SÁCH ĐẦY ĐỦ quyền muốn có (không phải diff) — gửi thiếu là mất quyền, tránh hiểu nhầm */
export const UpdateRolePermissionsBodySchema = z
  .object({ permissionIds: z.array(z.number().int().positive()) })
  .strict()

export const getRoleParamsSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict()

export const updateRoleBodySchema = RoleSchema.pick({
  isActive: true,
  name: true,
  description: true,
})
  .extend({
    permissionIds: z.array(z.number()),
  })
  .strict()

export type RoleBodyType = z.infer<typeof RoleBodySchema>
export type RoleBodyResType = z.infer<typeof RoleBodyResSchema>
export type GetRoleWithPermissionResType = z.infer<typeof GetRoleWithPermissonResSchema>
export type GetRolesResType = z.infer<typeof GetRolesResSchema>
export type GetRoleQueryType = z.infer<typeof getRoleQuerySchema>
export type GetRoleParamsType = z.infer<typeof getRoleParamsSchema>
export type UpdateRoleBodyType = z.infer<typeof updateRoleBodySchema>
