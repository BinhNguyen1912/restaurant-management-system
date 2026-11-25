import { RoleSchema } from '@/shared/models/shared-role.model'
import { UserSchema } from '@/shared/models/shared-user.model'
import { totalmem } from 'os'
import { z } from 'zod'

export const UserBodySchema = UserSchema.pick({
  email: true,
  password: true,
  phoneNumber: true,
  name: true,
  avatar: true,
  roleId: true,
  status: true,
})
  // chi nhánh nhân viên làm việc: quyết định dữ liệu họ nhìn thấy (ADR 0001 D4)
  .extend({ branchId: z.number().int().positive().nullable().optional() })
  .strict()
export const UpdateUserBodySchema = UserBodySchema.extend({
  password: z.string().nullable().optional(),
  changePassword: z.boolean(),
  newPassword: z.string().nullable().optional(),
  confirmNewPassword: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).default('ACTIVE').optional(),
}).superRefine((data, ctx) => {
  if (data.changePassword) {
    if (!data.newPassword || !data.confirmNewPassword) {
      ctx.addIssue({
        code: 'custom',
        message: 'Vui lòng nhập đầy đủ mật khẩu mới và xác nhận.',
        path: ['newPassword'],
      })
    } else if (data.newPassword !== data.confirmNewPassword) {
      ctx.addIssue({
        code: 'custom',
        message: 'Mật khẩu xác nhận không khớp.',
        path: ['confirmNewPassword'],
      })
    }
  }
})
export const UserResSchema = UserSchema.omit({
  password: true,
  totpSecret: true,
})
export const GetParamsUserSchema = z.object({
  userId: z.coerce.number().int().positive(),
})

export const GetUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
})
export const getListUsersSchema = z.object({
  data: z.array(
    UserSchema.omit({
      password: true,
      totpSecret: true,
    }).extend({
      role: RoleSchema.pick({ name: true, id: true }),
    }),
  ),
  totalItems: z.number(),
  totalPages: z.number(),
  page: z.number(),
  limit: z.number(),
})
export type UserResType = z.infer<typeof UserResSchema>
export type UserBodyType = z.infer<typeof UserBodySchema>
export type UpdateUserBodyType = z.infer<typeof UpdateUserBodySchema>
export type GetParamsUserType = z.infer<typeof GetParamsUserSchema>
export type GetUsersQueryType = z.infer<typeof GetUsersQuerySchema>
export type getListUsersType = z.infer<typeof getListUsersSchema>
