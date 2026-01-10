import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const TableExitsException = new UnprocessableEntityException({
  message: 'Error.TableExits',
  path: 'number',
})
export const TableNotFoundException = new NotFoundException({
  message: 'Error.TableNotFound',
  path: 'number',
})
