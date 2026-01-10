import { BadRequestException, UnprocessableEntityException } from '@nestjs/common'

export const ProductTranslationForeignKeyErrorException = new BadRequestException({
  message: 'Error.ProductTranslationForeignKeyError',
})

export const ProductTranslationNotFoundException = new UnprocessableEntityException({
  message: 'Error.ProductTranslationNotFound',
  path: 'id',
})

export const ProductTranslationExitsException = new UnprocessableEntityException({
  message: 'Error.ProductTranslationExits',
  path: ['productId', 'languageId'],
})
