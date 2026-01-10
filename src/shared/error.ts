import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const InvalidEmailException = new UnprocessableEntityException({
  message: 'Error.InvalidEmail',
  path: 'email',
})

export const EmailAlreadyExistsException = new UnprocessableEntityException({
  message: 'Error.EmailAlreadyExists',
  path: 'email',
})

export const NotFoundRecipeBySkuId = new NotFoundException({
  message: 'Error.NotFoundRecipeBySkuId',
})
