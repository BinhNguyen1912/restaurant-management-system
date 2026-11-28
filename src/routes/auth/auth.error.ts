import { HttpException, HttpStatus, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'

export const VerificationCodeNotFoundException = new UnprocessableEntityException({
  message: 'Error.VerificationCodeNotFound',
  path: 'code',
})

export const VerificationCodeExpiredException = new UnprocessableEntityException({
  message: 'Error.VerificationCodeExpired',
  path: 'code',
})

/**
 * 429 khi mã đã bị nhập sai quá ngưỡng (prod-readiness M1).
 *
 * Không phải 422: 422 nghĩa là "mã này sai, gõ lại mã này" — còn ở đây mã đã chết, gõ lại cũng vô
 * ích, phải bấm gửi lại mã. FE cần hai thông báo khác nhau cho hai tình huống đó.
 */
export const VerificationCodeTooManyAttemptsException = new HttpException(
  { message: 'Error.VerificationCodeTooManyAttempts', path: 'code' },
  HttpStatus.TOO_MANY_REQUESTS,
)

/** 429 khi một email đã xin mã quá số lượt cho phép trong cửa sổ 15 phút */
export const OtpTooManyRequestsException = new HttpException(
  { message: 'Error.OtpTooManyRequests', path: 'email' },
  HttpStatus.TOO_MANY_REQUESTS,
)
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
