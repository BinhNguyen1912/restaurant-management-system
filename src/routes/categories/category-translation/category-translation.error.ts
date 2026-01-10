import { UnprocessableEntityException } from '@nestjs/common'

export const CategoryTranslationNotFoundException = new UnprocessableEntityException({
  message: 'Error.CategoryTranslationNotFound',
  path: 'id',
})
export const CategoryTranslationExitsException = new UnprocessableEntityException({
  message: 'Error.CategoryTranslationExits',
  path: ['categoryId', 'languageId'],
})
export const CategoryIdOrLanguageIdFkConstraintFailedException = new UnprocessableEntityException({
  message: 'Error.CategoryIdOrLanguageIdFkConstraintFailed',
  path: ['categoryId', 'languageId'],
})
