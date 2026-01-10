import { CanActivate, createParamDecorator, ExecutionContext } from '@nestjs/common'
import { REQUEST_USER_KEY } from '../constants/auth.constant'
import { AccessTokenPayload } from '../types/jwt.types'

export const ActiveUser = createParamDecorator(
  (field: keyof AccessTokenPayload | undefined, content: ExecutionContext) => {
    const req = content.switchToHttp().getRequest()
    const user = req[REQUEST_USER_KEY]
    return field ? user?.[field] : user
  },
)
