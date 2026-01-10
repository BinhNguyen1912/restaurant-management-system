import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const LanguageExitsException = new UnprocessableEntityException({
  message: 'Error.LanguageExits',
  path: 'id',
})

export const LanguageNotFoundException = new NotFoundException({
  message: 'Error.LanguageNotFound',
  path: 'id',
})
