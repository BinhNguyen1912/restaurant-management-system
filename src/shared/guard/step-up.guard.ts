import { REQUEST_USER_KEY, STEP_UP_REQUIRED_KEY, STEP_UP_TOKEN_HEADER } from '@/shared/constants/auth.constant'
import { TokenService } from '@/shared/service/token.service'
import { AccessTokenPayload, StepUpTokenPayload } from '@/shared/types/jwt.types'
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

/**
 * Guard cho thao tác nhạy cảm: đòi vé `x-step-up-token` vừa cấp từ `POST /auth/reauth`.
 *
 * Trả **401**, không 403: 403 nghĩa là "tài khoản này không có quyền làm việc đó", còn ở đây quyền
 * có đủ — thiếu là *xác thực lại*. FE phải phân biệt được hai thứ này để biết hiện hộp thoại mật
 * khẩu hay báo "không có quyền".
 *
 * Chạy SAU `AuthenticationGuard` (đăng ký sau trong `app.module.ts`): nó cần `request.user` đã được
 * gắn từ access token, vì vé phải thuộc đúng người đang gọi.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(STEP_UP_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required) return true

    const request = context.switchToHttp().getRequest()
    const header = request.headers?.[STEP_UP_TOKEN_HEADER]
    const token = Array.isArray(header) ? header[0] : header
    if (!token) {
      throw new HttpException('Error.StepUpRequired', HttpStatus.UNAUTHORIZED)
    }

    const user = request[REQUEST_USER_KEY] as AccessTokenPayload | undefined
    const payload = await this.verify(token)
    // Vé của NGƯỜI KHÁC không dùng được. Không kiểm chỗ này thì một vé hợp lệ của bất kỳ tài khoản
    // nào cũng mở khoá thao tác cho mọi tài khoản khác — vé chỉ còn là "ai đó đã nhập mật khẩu".
    if (!user || payload.userId !== user.userId) {
      throw new HttpException('Error.StepUpInvalid', HttpStatus.UNAUTHORIZED)
    }
    return true
  }

  private async verify(token: string): Promise<StepUpTokenPayload> {
    try {
      const payload = await this.tokenService.VerifyStepUpToken(token)
      // `typ` kiểm lại sau khi đã verify chữ ký: khoá ký đã tách khỏi access token, đây là lớp thứ
      // hai cho trường hợp ai đó dùng chung khoá trong tương lai.
      if (payload.typ !== 'STEP_UP') throw new Error('sai loại token')
      return payload
    } catch {
      // Hết hạn, sai chữ ký, sai loại — cùng một câu trả lời. Nói rõ sai ở đâu chỉ giúp người dò
      // biết mình đã đi đúng hay sai đường.
      throw new HttpException('Error.StepUpInvalid', HttpStatus.UNAUTHORIZED)
    }
  }
}
