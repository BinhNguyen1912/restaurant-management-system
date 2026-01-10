import { ForbiddenException, NotFoundException } from '@nestjs/common'

export const NotFoundReservationException = new NotFoundException({
  message: 'Error.NotFoundReservation',
  path: 'id',
})
export const ForbiddenAccessException = new ForbiddenException({
  message: 'Error.ForbiddenAccess',
})
export const TableNodeNotFoundException = new NotFoundException({
  message: 'Error.TableNodeNotFound',
})
