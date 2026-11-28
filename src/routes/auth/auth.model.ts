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

/**
 * Một dòng `VerificationCode` như DB giữ.
 *
 * Không dùng chung `verificationCodeSchema`: schema của request có `code` plaintext (khách gõ vào),
 * còn dòng DB chỉ có `codeHash`. Gộp hai thứ vào một schema là đường ngắn nhất để lưu nhầm plaintext.
 */
export const verificationCodeRecordSchema = z.object({
  id: z.number(),
  email: z.string(),
  codeHash: z.string().length(64),
  type: z.enum([
    TypeOfVerification.REGISTER,
    TypeOfVerification.FORGOT_PASSWORD,
    TypeOfVerification.LOGIN,
    TypeOfVerification.DISABLE_2FA,
  ]),
  attempts: z.number().int().min(0),
  consumedAt: z.date().nullable(),
  expiresAt: z.date(),
  createdAt: z.date(),
})

/**
 * 2FA bằng ứng dụng xác thực (prod-readiness §M9 mục 5).
 *
 * `secret` chỉ trả về đúng MỘT lần, ở bước setup — lúc người dùng quét QR. Không có endpoint nào
 * đọc lại bí mật: đọc lại được nghĩa là một phiên bị chiếm cũng lấy được bí mật, và 2FA hết tác dụng.
 */
export const twoFactorSetupResSchema = z.object({
  /** bí mật base32 — để gõ tay khi không quét được QR */
  secret: z.string(),
  /** `otpauth://...` để FE vẽ QR */
  otpauthUri: z.string(),
})

export const enableTwoFactorBodySchema = z
  .object({
    /** mã 6 số từ ứng dụng xác thực: chứng minh điện thoại đã có bí mật TRƯỚC khi bật */
    totpCode: z.string({ message: 'Error.CodeMustBeString' }).length(6),
  })
  .strict()

export const disableTwoFactorBodySchema = UserSchema.pick({ password: true })
  .extend({
    /**
     * Yếu tố thứ hai — phải có ĐÚNG một trong hai.
     *
     * `code` (OTP qua email) là đường khôi phục khi mất điện thoại: nếu chỉ nhận TOTP thì mất máy
     * là mất luôn tài khoản, và cách duy nhất để vào lại là sửa thẳng DB.
     */
    totpCode: z.string({ message: 'Error.CodeMustBeString' }).length(6).optional(),
    code: z.string({ message: 'Error.CodeMustBeString' }).length(6).optional(),
  })
  .strict()

/**
 * Nhập lại mật khẩu để mở khoá MỘT thao tác nhạy cảm (step-up) — xem `StepUpGuard`.
 *
 * Cùng hình dạng với đăng nhập (mật khẩu + yếu tố thứ hai nếu đã bật 2FA) nhưng trả về một VÉ
 * ngắn hạn chứ không phải token phiên: đây là lần xác nhận lại, không phải đăng nhập lần hai.
 */
export const reauthenticateBodySchema = UserSchema.pick({ password: true })
  .extend({
    totpCode: z.string({ message: 'Error.CodeMustBeString' }).length(6).optional(),
    code: z.string({ message: 'Error.CodeMustBeString' }).length(6).optional(),
  })
  .strict()

export const reauthenticateResSchema = z.object({
  /** vé cho header `x-step-up-token`, dùng được cho mọi thao tác nhạy cảm tới khi hết hạn */
  stepUpToken: z.string(),
  /** hết hạn lúc nào (ISO) — FE đóng hộp thoại theo mốc này thay vì tự đoán */
  expiresAt: z.string(),
})

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
export type VerificationCodeRecordType = z.infer<typeof verificationCodeRecordSchema>
export type OtpBodyType = z.infer<typeof otpBodySchema>
export type OtpResType = z.infer<typeof otpResSchema>
export type GetUserIncludeRoleType = z.infer<typeof GetUserIncludeRoleSchema>
export type RefreshTokenType = z.infer<typeof refreshTokenShema>
export type CreateRefreshTokenType = z.infer<typeof createRefreshTokenSchema>
export type RefreshTokenResType = z.infer<typeof RefreshTokenResSchema>
export type ForgotPasswordType = z.infer<typeof forgotPasswordSchema>
export type RefreshTokenBodyType = z.infer<typeof RefreshTokenBodySchema>
export type GetAccessTokenResType = z.infer<typeof GetAccessTokenResSchema>
export type TwoFactorSetupResType = z.infer<typeof twoFactorSetupResSchema>
export type EnableTwoFactorBodyType = z.infer<typeof enableTwoFactorBodySchema>
export type DisableTwoFactorBodyType = z.infer<typeof disableTwoFactorBodySchema>
export type ReauthenticateBodyType = z.infer<typeof reauthenticateBodySchema>
export type ReauthenticateResType = z.infer<typeof reauthenticateResSchema>
