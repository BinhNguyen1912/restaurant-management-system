import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const ReminderNotFoundException = new NotFoundException({
  message: 'Error.ReminderNotFound',
  path: 'id',
})

export const ReminderLogNotFoundException = new NotFoundException({
  message: 'Error.ReminderLogNotFound',
  path: 'logId',
})
