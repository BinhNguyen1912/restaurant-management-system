import { BadRequestException, UnprocessableEntityException } from '@nestjs/common'

export const ProductForeignKeyErrorException = new BadRequestException({
  message: 'Error.ProductForeignKeyError',
})

export const ProductNotFoundException = new UnprocessableEntityException({
  message: 'Error.ProductNotFound',
  path: 'id',
})

export const ProductExitsException = new UnprocessableEntityException({
  message: 'Error.ProductExits',
  path: 'name',
})
