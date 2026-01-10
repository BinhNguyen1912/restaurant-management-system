import envConfig from '@/shared/config'
import { AuthType } from '@/shared/constants/auth.constant'
import { AuthKey, AuthTypeDecorator } from '@/shared/decorators/auth.decorator'
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class PaymentApiKeyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip authentication if AuthType.None is used
    const authTypesValue = this.reflector.getAllAndOverride<AuthTypeDecorator | undefined>(AuthKey, [
      context.getHandler(),
      context.getClass(),
    ])

    if (authTypesValue?.authTypes.includes(AuthType.None)) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const apiKey = request.headers['payment-api-key']
    if (!apiKey) throw new UnauthorizedException('Error.MissingApiKeyFromHeader')
    if (apiKey !== envConfig.PAYMENT_API_KEY) {
      throw new UnauthorizedException('Error.ApiKeyNotMatch')
    }
    return true
  }
}
