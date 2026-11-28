import { TypeOfVerification } from '@/shared/constants/auth.constant'
import { roleName } from '@/shared/constants/role.constant'
import { RoleSchema } from '@/shared/models/shared-role.model'
import { UserSchema } from '@/shared/models/shared-user.model'
import z from 'zod'

export const registerBodySchema = UserSchema.pick({
  email: true,
  password: true,
  name: true,
  phoneNumber: true,
})
  .extend({
    confirmPassword: z.string({ message: 'confirmPassword must be string' }).min(6).max(32),
    code: z.string().min(6).max(6),
  })
  .superRefine(({ confirmPassword, password }, ctx) => {
    if (confirmPassword !== password) {
      ctx.addIssue({
        code: 'custom',
        message: 'Error.PasswordsNotMatch',
        path: ['confirmPassword'],
      })
    }
  })

export const registerResRepoSchema = UserSchema.omit({
  password: true,
  totpSecret: true,
})
export const registerResSchema = z.object({
  user: z.object({
    id: z.number().positive(),
    email: z.email().trim().min(5).max(64),
    name: z.string().min(2).max(32),
    avatar: z.string().url().nullable().optional(),
    /**
     * KHÔNG chốt cứng 4 role hệ thống: hệ thống cho tạo role mới (vd KE_TOAN). Chốt cứng thì
     * serializer ném lỗi và người dùng role mới **không đăng nhập được** (500), dù quyền đã cấp.
     */
    roleName: z.string().min(1),
    /** chi nhánh nhân viên thuộc về (null = chưa gán) */
    branchId: z.number().nullable().optional(),
    branch: z
      .object({ id: z.number(), code: z.string(), name: z.string(), isActive: z.boolean() })
      .nullable()
      .optional(),
  }),
  accessToken: z.string(),
  refreshToken: z.string(),
})

export const loginBodySchema = UserSchema.pick({
  email: true,
  password: true,
})
  .extend({
    //xac thuc 2fa bang 1 trong 2 truong
    totpCode: z.string().length(6).optional(), //2FA CODE
    code: z.string().length(6).optional(), //CODE NAY GUI QUA EMAIL
  })
  .strict()
export const loginResSchema = registerResSchema
export const verificationCodeSchema = UserSchema.pick({ email: true }).extend({
  code: z
    .string({ message: 'Error.CodeMustBeString' })
    .min(6, { message: 'Error.TooShort' })
    .max(6, { message: 'Error.TooLong' }),
  type: z.enum(
    [
      TypeOfVerification.REGISTER,
      TypeOfVerification.FORGOT_PASSWORD,
      TypeOfVerification.LOGIN,
      TypeOfVerification.DISABLE_2FA,
    ],
    {
      message: 'Error.InvalidVerificationCodeType',
    },
  ),
  id: z.number().optional(),
  expiresAt: z.date(),
  createdAt: z.date().optional(),
})

export const otpBodySchema = verificationCodeSchema.pick({
  email: true,
  type: true,
})

export const otpResSchema = verificationCodeSchema

export const GetUserIncludeRoleSchema = UserSchema.extend({
  role: RoleSchema,
})

export const refreshTokenShema = z.object({
  userId: z.number().positive(),
  /** sha256 hex của chính refresh token — không bao giờ lưu plaintext */
  tokenHash: z.string().length(64),
  /** một lần login = một family; refresh xoay vòng trong cùng family */
  familyId: z.string().min(1).max(36),
  expiresAt: z.date(),
  usedAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
  createdAt: z.date(),
})
export const createRefreshTokenSchema = refreshTokenShema.pick({
  userId: true,
  tokenHash: true,
  familyId: true,
  expiresAt: true,
})

export const RefreshTokenResSchema = refreshTokenShema.pick({
  userId: true,
  tokenHash: true,
  familyId: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
  createdAt: true,
})

export const forgotPasswordSchema = UserSchema.pick({
  email: true,
})
  .extend({
    code: z.string().min(6).max(6),
    newPassword: z.string().min(6).max(32),
    confirmNewPassword: z.string().min(6).max(32),
  })
  .superRefine(({ confirmNewPassword, newPassword }, ctx) => {
    if (confirmNewPassword !== newPassword) {
      ctx.addIssue({
        code: 'custom',
        message: 'Error.PasswordsNotMatch',
        path: ['confirmNewPassword'],
      })
    }
  })

export const RefreshTokenBodySchema = z.object({
  refreshToken: z.string(),
})
export const LogoutBodySchema = RefreshTokenBodySchema

export const UpdateProfileResSchema = UserSchema.omit({
  password: true,
  totpSecret: true,
})

export const GetAccessTokenResSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})

export type UpdateProfileResType = z.infer<typeof UpdateProfileResSchema>
export type LogoutBodyType = RefreshTokenBodyType
export type RegisterBodyType = z.infer<typeof registerBodySchema>
export type RegisterResRepoType = z.infer<typeof registerResRepoSchema>
export type RegisterResType = z.infer<typeof registerResSchema>
export type LoginBodyType = z.infer<typeof loginBodySchema>
export type LoginResType = z.infer<typeof loginResSchema>
export type VerificationCodeType = z.infer<typeof verificationCodeSchema>
export type OtpBodyType = z.infer<typeof otpBodySchema>
export type OtpResType = z.infer<typeof otpResSchema>
export type GetUserIncludeRoleType = z.infer<typeof GetUserIncludeRoleSchema>
export type RefreshTokenType = z.infer<typeof refreshTokenShema>
export type CreateRefreshTokenType = z.infer<typeof createRefreshTokenSchema>
export type RefreshTokenResType = z.infer<typeof RefreshTokenResSchema>
export type ForgotPasswordType = z.infer<typeof forgotPasswordSchema>
export type RefreshTokenBodyType = z.infer<typeof RefreshTokenBodySchema>
export type GetAccessTokenResType = z.infer<typeof GetAccessTokenResSchema>
