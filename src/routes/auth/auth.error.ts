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

/**
 * 401 khi tài khoản đã bật 2FA mà request không gửi mã thứ hai (prod-readiness §M9 mục 5).
 *
 * 401 chứ không phải 422: mật khẩu đã đúng, chưa có gì sai — request chỉ chưa đủ để mở phiên. FE
 * dựa vào `message` này để hiện ô nhập mã, nên nó phải khác hẳn "sai mật khẩu".
 */
export const TwoFactorRequiredException = new UnauthorizedException({
  message: 'Error.TwoFactorRequired',
  path: 'totpCode',
})

/**
 * 422 khi mã thứ hai sai.
 *
 * Tách khỏi `InvalidPasswordException`: người dùng gõ đúng mật khẩu rồi gõ sai mã, hiện "sai mật
 * khẩu" là chỉ sai chỗ cần sửa.
 */
export const InvalidTwoFactorCodeException = new UnprocessableEntityException({
  message: 'Error.InvalidTwoFactorCode',
  path: 'totpCode',
})

/** 422 khi gọi setup cho tài khoản đã bật 2FA — phải tắt trước, không thì mất bí mật đang dùng */
export const TwoFactorAlreadyEnabledException = new UnprocessableEntityException({
  message: 'Error.TwoFactorAlreadyEnabled',
  path: 'twoFactor',
})

/** 422 khi enable/disable trong lúc chưa có bí mật (chưa chạy setup) */
export const TwoFactorNotSetUpException = new UnprocessableEntityException({
  message: 'Error.TwoFactorNotSetUp',
  path: 'twoFactor',
})
