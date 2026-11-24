import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'

export const CashShiftAlreadyOpenException = new ConflictException({
  message: 'Error.CashShiftAlreadyOpen',
  path: 'shift',
})

export const CashShiftNotFoundException = new NotFoundException({
  message: 'Error.CashShiftNotFound',
  path: 'id',
})

export const CashShiftClosedException = new ConflictException({
  message: 'Error.CashShiftClosed',
  path: 'id',
})

export const CashShiftNotOwnedException = new ForbiddenException({
  message: 'Error.CashShiftNotOwned',
  path: 'id',
})

/** Con don tien mat chua thu trong ca -> khong dong ca duoc (ticket P2-1) */
export const CashShiftHasUnpaidCashOrdersException = (orderIds: number[]) =>
  new BadRequestException(
    `Còn đơn tiền mặt chưa thanh toán trong ca: ${orderIds.map((id) => `#${id}`).join(', ')}. Thu tiền xong mới đóng ca được.`,
  )
