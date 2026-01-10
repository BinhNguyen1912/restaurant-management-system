import { UnprocessableEntityException } from '@nestjs/common'

export const TableLayoutAlreadyExitsException = new UnprocessableEntityException({
  message: 'Error.TableLayoutAlreadyExits',
  path: 'name',
})
export const TableLayoutNotFoundException = new UnprocessableEntityException({
  message: 'Error.TableLayoutNotFound',
  path: 'id',
})
