import { UnprocessableEntityException } from '@nestjs/common'

export const IngredientAlreadyExitsException = new UnprocessableEntityException({
  message: 'Error.IngredientAlreadyExits',
  path: 'name',
})
export const IngredientNotFoundException = new UnprocessableEntityException({
  message: 'Error.IngredientNotFound',
  path: 'id',
})
export const UnitNotFoundException = new UnprocessableEntityException({
  message: 'Error.UnitNotFound',
  path: 'unitId',
})
