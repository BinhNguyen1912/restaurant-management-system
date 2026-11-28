import { ALLOW_DURING_ENROLMENT_KEY, REQUEST_USER_KEY } from '@/shared/constants/auth.constant'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

/**
 * Chặn phiên "phải bật 2FA trước" khỏi mọi route, trừ những route được đánh dấu.
 *
 * Vì sao không chặn ngay ở cửa đăng nhập: tài khoản chưa bật 2FA mà không đăng nhập được thì cũng
 * không gọi được `/auth/2fa/setup` để bật — tự khoá mình ra ngoài, và đường còn lại duy nhất là sửa
 * DB. Nên phiên vẫn được mở, nhưng chỉ mở đúng ba cửa: setup, enable, logout.
 *
 * Trạng thái lấy từ claim trong access token (`enrolmentRequired`) chứ không hỏi DB mỗi request:
 * một query cho mỗi lần gọi API là giá đắt cho một điều kiện đổi vài lần trong đời tài khoản. Giá
 * phải trả: sau khi bật 2FA xong, phiên cũ vẫn mang cờ cho tới lần cấp token kế tiếp — vì vậy FE
 * gọi `/auth/refresh-token` ngay sau khi bật (đường này tính lại cờ từ DB), không đăng nhập lại.
 */
@Injectable()
export class TwoFactorEnrolmentGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request[REQUEST_USER_KEY] as AccessTokenPayload | undefined
    // Route công khai (không có user) và phiên bình thường: không có gì để chặn.
    if (!user?.enrolmentRequired) return true

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_ENROLMENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (allowed) return true

    // 403 chứ không 401: đã biết bạn là ai, chỉ chưa đủ điều kiện đi tiếp. FE dùng đúng mã này để
    // hiện màn hình enrolment thay vì màn hình đăng nhập.
    throw new HttpException('Error.TwoFactorEnrolmentRequired', HttpStatus.FORBIDDEN)
  }
}
