import { UnprocessableEntityException } from '@nestjs/common'

export const TableNodeAlreadyExitsException = new UnprocessableEntityException({
  message: 'Error.TableNodeAlreadyExits',
  path: 'name',
})
export const TableNodeNotFoundException = new UnprocessableEntityException({
  message: 'Error.TableNodeNotFound',
  path: 'id',
})
