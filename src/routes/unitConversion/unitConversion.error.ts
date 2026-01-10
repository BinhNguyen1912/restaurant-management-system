import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const UnitConversionAlreadyExitsException = new UnprocessableEntityException({
  message: 'Error.UnitConversionAlreadyExits',
  path: 'name',
})
export const UnitConversionNotFoundException = new NotFoundException('Error.UnitConversionNotFound')
