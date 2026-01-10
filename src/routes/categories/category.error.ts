import { UnprocessableEntityException } from '@nestjs/common'

export const CategoryAlreadyExitsException = new UnprocessableEntityException({
  message: 'Error.CategoryAlreadyExits',
  path: 'name',
})
export const CategoryNotFoundException = new UnprocessableEntityException({
  message: 'Error.CategoryNotFound',
  path: 'id',
})
export const CategoryCanNotBeItsOwnPararentException = new UnprocessableEntityException({
  message: 'Error.CategoryCanNotBeItsOwnPararent',
})
