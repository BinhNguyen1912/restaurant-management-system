import { UnprocessableEntityException } from '@nestjs/common'

export const AreaAlreadyExitsException = new UnprocessableEntityException({
  message: 'Error.AreaAlreadyExits',
  path: 'name',
})
export const AreaNotFoundException = new UnprocessableEntityException({
  message: 'Error.AreaNotFound',
  path: 'id',
})
