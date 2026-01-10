import { UnprocessableEntityException } from '@nestjs/common'

export const PermissionAlreadyExitsException = new UnprocessableEntityException([
  {
    message: 'Error.PermissionAlreadyExits',
    path: 'path',
  },
  {
    message: 'Error.PermissionAlreadyExits',
    path: 'method',
  },
])
export const PermissionNotFoundException = new UnprocessableEntityException({
  message: 'Error.PermissionNotFound',
  path: 'id',
})
