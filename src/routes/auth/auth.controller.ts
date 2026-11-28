import {
  DisableTwoFactorBodyDTO,
  EnableTwoFactorBodyDTO,
  FogotPasswordBodyDTO,
  GetAccessTokenDTO,
  LoginBodyDTO,
  LoginResDTO,
  LogoutBodyDTO,
  OTPBodyDto,
  ReauthenticateBodyDTO,
  ReauthenticateResDTO,
  RefreshTokenBodyDTO,
  RegisterBodyDTO,
  RegisterResDTO,
  TwoFactorSetupResDTO,
} from '@/routes/auth/auth.dto'
import { loginResSchema } from '@/routes/auth/auth.model'
import { AuthService } from '@/routes/auth/auth.service'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { IsPublic } from '@/shared/decorators/auth.decorator'
import { MessageResDto } from '@/shared/dtos/respone.dto'
import { AccessTokenGuard } from '@/shared/guard/access-token.guard'
import { Body, Controller, Ip, Post, Res, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
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

  /**
   * Nhập lại mật khẩu để mở khoá một thao tác nhạy cảm (step-up).
   *
   * Trả **vé ngắn hạn** (5 phút) chứ không phải token phiên — xem `StepUpGuard`. FE gọi route này
   * khi nhận 401 `Error.StepUpRequired`, rồi gắn vé vào header `x-step-up-token` cho request vừa
   * hỏng và các request nhạy cảm tiếp theo tới khi hết hạn.
   *
   * `@Throttle` chặt hơn ngưỡng toàn cục (40/phút): đây là chỗ dò mật khẩu có thể xảy ra từ bên
   * trong một phiên đã bị chiếm. Trong test nới ra như ngưỡng toàn cục, nếu không chính suite
   * step-up sẽ ăn 429.
   */
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  @Post('reauth')
  @ZodSerializerDto(ReauthenticateResDTO)
  reauthenticate(@Body() body: ReauthenticateBodyDTO, @ActiveUser('userId') userId: number, @Ip() ip: string) {
    return this.authService.reauthenticate(userId, body, { ip })
  }

  /**
   * 2FA bằng ứng dụng xác thực (prod-readiness §M9 mục 5). Ba route này **không** `@IsPublic()`:
   * bật/tắt xác thực hai lớp của chính mình thì phải đang đăng nhập, và người dùng lấy từ token
   * chứ không từ body — nhận `userId` từ body là cho phép tắt 2FA của người khác.
   */
  @Post('2fa/setup')
  @ZodSerializerDto(TwoFactorSetupResDTO)
  setupTwoFactor(@ActiveUser('userId') userId: number) {
    return this.authService.setupTwoFactor(userId)
  }

  @Post('2fa/enable')
  @ZodSerializerDto(MessageResDto)
  enableTwoFactor(@Body() body: EnableTwoFactorBodyDTO, @ActiveUser('userId') userId: number) {
    return this.authService.enableTwoFactor(userId, body)
  }

  @Post('2fa/disable')
  @ZodSerializerDto(MessageResDto)
  disableTwoFactor(@Body() body: DisableTwoFactorBodyDTO, @ActiveUser('userId') userId: number) {
    return this.authService.disableTwoFactor(userId, body)
  }

  @Post('logout')
  @ZodSerializerDto(MessageResDto)
  async logout(@Body() body: LogoutBodyDTO) {
    return await this.authService.logout(body)
  }
}
