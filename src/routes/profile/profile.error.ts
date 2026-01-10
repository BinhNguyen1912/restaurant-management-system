import { UnprocessableEntityException } from '@nestjs/common'

export const IncorrectPasswordException = new UnprocessableEntityException({
  message: 'Error.IncorrectPassword',
  path: 'password',
})
export const NewPasswordMustBeDifferentException = new UnprocessableEntityException({
  message: 'Error.NewPasswordMustBeDifferent',
  path: 'newPassword',
})
export const UserNotFoundException = new UnprocessableEntityException({
  message: 'Error.UserNotFound',
  path: 'id',
})
