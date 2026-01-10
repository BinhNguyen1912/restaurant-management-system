import { NotFoundException } from '@nestjs/common'

export const NotFoundRecipeBySkuId = new NotFoundException({
  message: 'Error.NotFoundRecipeBySkuId',
})
