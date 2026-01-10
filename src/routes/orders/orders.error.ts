import { NotFoundException } from '@nestjs/common'

export const OrderNotFoundException = new NotFoundException({
  message: 'Error.OrderNotFound',
  path: 'id',
})
export const NoOrdersToPayException = new NotFoundException({
  message: 'Error.NoOrdersToPay',
  path: 'guestId',
})
