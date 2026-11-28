import {
  FogotPasswordBodyDTO,
  GetAccessTokenDTO,
  LoginBodyDTO,
  LoginResDTO,
  LogoutBodyDTO,
  OTPBodyDto,
  RefreshTokenBodyDTO,
  RegisterBodyDTO,
  RegisterResDTO,
} from '@/routes/auth/auth.dto'
import { loginResSchema } from '@/routes/auth/auth.model'
import { AuthService } from '@/routes/auth/auth.service'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { IsPublic } from '@/shared/decorators/auth.decorator'
import { MessageResDto } from '@/shared/dtos/respone.dto'
import { AccessTokenGuard } from '@/shared/guard/access-token.guard'
import { Body, Controller, Ip, Post, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @IsPublic()
  @Post('otp')
  @ZodSerializerDto(MessageResDto)
  sendOTP(@Body() body: OTPBodyDto) {
    return this.authService.sendOTP(body)
  }

  @IsPublic()
  @Post('register')
  @ZodSerializerDto(RegisterResDTO)
  register(@Body() body: RegisterBodyDTO) {
    return this.authService.register(body)
  }

  @IsPublic()
  @Post('login')
  @ZodSerializerDto(LoginResDTO)
  login(@Body() body: LoginBodyDTO, @Ip() ip: string) {
    return this.authService.login(body, { ip })
  }

  @IsPublic()
  @Post('forgot-password')
  @ZodSerializerDto(MessageResDto)
  async forgotPassword(@Body() body: FogotPasswordBodyDTO) {
    return await this.authService.forgotPassword(body)
  }

  @IsPublic()
  @Post('refresh-token')
  @ZodSerializerDto(GetAccessTokenDTO)
  async provideAccessTokenByRefreshToken(@Body() body: RefreshTokenBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.authService.provideAccessTokenByRefreshToken(body)
  }

  @Post('logout')
  @ZodSerializerDto(MessageResDto)
  async logout(@Body() body: LogoutBodyDTO) {
    return await this.authService.logout(body)
  }
}
