import {
  disableTwoFactorBodySchema,
  enableTwoFactorBodySchema,
  forgotPasswordSchema,
  GetAccessTokenResSchema,
  loginBodySchema,
  loginResSchema,
  LogoutBodySchema,
  otpBodySchema,
  RefreshTokenBodySchema,
  registerBodySchema,
  registerResSchema,
  twoFactorSetupResSchema,
} from '@/routes/auth/auth.model'
import { createZodDto } from 'nestjs-zod'

export class OTPBodyDto extends createZodDto(otpBodySchema) {}
export class RegisterBodyDTO extends createZodDto(registerBodySchema) {}
export class RegisterResDTO extends createZodDto(registerResSchema) {}
export class LoginBodyDTO extends createZodDto(loginBodySchema) {}
export class LoginResDTO extends createZodDto(loginResSchema) {}
export class FogotPasswordBodyDTO extends createZodDto(forgotPasswordSchema) {}
export class GetAccessTokenDTO extends createZodDto(GetAccessTokenResSchema) {}
export class RefreshTokenBodyDTO extends createZodDto(RefreshTokenBodySchema) {}
export class LogoutBodyDTO extends createZodDto(LogoutBodySchema) {}
export class EnableTwoFactorBodyDTO extends createZodDto(enableTwoFactorBodySchema) {}
export class DisableTwoFactorBodyDTO extends createZodDto(disableTwoFactorBodySchema) {}
export class TwoFactorSetupResDTO extends createZodDto(twoFactorSetupResSchema) {}
