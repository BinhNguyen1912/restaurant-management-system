import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'

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
export const EmailNotFoundException = new UnprocessableEntityException({
  message: 'Error.EmailNotFound',
  path: 'email',
})

export const RefreshTokenNotFoundOrExpiredException = new UnauthorizedException('Error.RefreshTokenNotFoundOrExpired')

export const RefreshTokenAlreadyUsedException = new UnauthorizedException('Error.RefreshTokenAlreadyUsed')
