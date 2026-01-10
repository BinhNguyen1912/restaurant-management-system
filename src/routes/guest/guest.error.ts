import { UnauthorizedException } from '@nestjs/common'

export const NotFoundRefreshToken = new UnauthorizedException({
  message: 'Error.NotFoundRefreshToken',
})
