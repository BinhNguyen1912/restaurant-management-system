import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const UserNotFoundException = new NotFoundException({
  message: 'Error.UserNotFound',
  path: 'id',
})

export const RoleNotAllowedException = new ForbiddenException({
  message: 'Error.RoleNotAllowed',
})
export const CannotUpdateOrDeleteOwnRoleException = new ForbiddenException({
  message: 'Error.CannotUpdateOrDeleteOwnRole',
})
export const ForeignKeyViolationException = new UnprocessableEntityException({
  message: 'Error.ForeignKeyViolation',
})
