import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const UnitAlreadyExitsException = new UnprocessableEntityException({
  message: 'Error.UnitAlreadyExits',
  path: 'name',
})
export const UnitNotFoundException = new NotFoundException('Error.UnitNotFound')
