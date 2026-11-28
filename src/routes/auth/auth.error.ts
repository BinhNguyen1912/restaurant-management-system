import { HttpException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'

export const VerificationCodeNotFoundException = new UnprocessableEntityException({
  message: 'Error.VerificationCodeNotFound',
  path: 'code',
})

export const VerificationCodeExpiredException = new UnprocessableEntityException({
  message: 'Error.VerificationCodeExpired',
  path: 'code',
})
export const InvalidPasswordException = new UnprocessableEntityException({
  message: 'Error.InvalidPassword',
  path: 'password',
})
/**
 * 423 Locked. Viết số trực tiếp vì `HttpStatus` của Nest 10 không có hằng cho 423 (enum dừng ở
 * 422 rồi nhảy 424); thiếu hằng thì `new HttpException(body, undefined)` lặng lẽ thành 500.
 */
const HTTP_LOCKED = 423

/**
 * Tài khoản đang bị khoá tạm vì sai mật khẩu quá ngưỡng (prod-readiness §0.2 #3).
 *
 * 423 LOCKED chứ không phải 422: client phải phân biệt được "gõ sai, thử lại được ngay" với
 * "bị khoá, thử lại cũng vô ích và phải chờ `minutes` phút" — nếu không, người dùng gõ lại
 * liên tục và tự đẩy thời gian chờ.
 */
export const AccountLockedException = (remainingMs: number) =>
  new HttpException(
    {
      message: 'Error.AccountLocked',
      path: 'email',
      minutes: Math.max(1, Math.ceil(remainingMs / 60_000)),
    },
    HTTP_LOCKED,
  )

export const EmailNotFoundException = new UnprocessableEntityException({
  message: 'Error.EmailNotFound',
  path: 'email',
})

export const RefreshTokenNotFoundOrExpiredException = new UnauthorizedException('Error.RefreshTokenNotFoundOrExpired')

export const RefreshTokenAlreadyUsedException = new UnauthorizedException('Error.RefreshTokenAlreadyUsed')
