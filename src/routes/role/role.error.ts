import { ForbiddenException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'

export const CreateRoleFailedException = new UnauthorizedException({
  message: 'Error.CreateRoleFailed',
})

export const RoleAlreadyExitsException = new UnprocessableEntityException({
  message: 'Error.RoleAlreadyExits',
  path: 'name',
})
export const SystemRoleDeletionErrorException = new ForbiddenException({
  message: 'Error.SystemRoleDeletionError',
})
export const CannotUpdateAdminRoleException = new ForbiddenException({
  message: 'Error.CannotUpdateAdminRole',
})
export const RoleNotFoundException = new UnprocessableEntityException({
  message: 'Error.RoleNotFound',
  path: 'id',
})
