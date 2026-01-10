import { AuthType, ConditionGuard } from '@/shared/constants/auth.constant'
import { AuthKey, AuthTypeDecorator } from '@/shared/decorators/auth.decorator'
import { AccessTokenGuard } from '@/shared/guard/access-token.guard'
import { PaymentApiKeyGuard } from '@/shared/guard/payment-api-key.guard'
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { TokenExpiredError } from '@nestjs/jwt'

@Injectable()
export class AuthenticationGuard {
  private AuthenticationGuardMap: Record<string, CanActivate>
  constructor(
    private accessTokenGuard: AccessTokenGuard,
    private paymentApiKeyGuard: PaymentApiKeyGuard,
    private reflector: Reflector,
  ) {
    this.AuthenticationGuardMap = {
      [AuthType.Bearer]: this.accessTokenGuard,
      [AuthType.PaymentApiKey]: this.paymentApiKeyGuard,
      [AuthType.None]: {
        canActivate: () => true,
      },
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authTypesValue = this.getAuthTypeType(context)
    const authTypes = authTypesValue.authTypes

    if (authTypes.includes(AuthType.None)) {
      return true
    }

    const guards = authTypes.map((authTypes) => this.AuthenticationGuardMap[authTypes])
    if (authTypesValue.option.condition === ConditionGuard.Or) {
      return this.handleOrConditon(guards, context)
    } else {
      return this.handleAndCondition(guards, context)
    }
  }
  private getAuthTypeType(context: ExecutionContext): AuthTypeDecorator {
    const authType = this.reflector.getAllAndOverride<AuthTypeDecorator | undefined>(AuthKey, [
      context.getHandler(),
      context.getClass(),
    ]) ?? { authTypes: [AuthType.Bearer], option: { condition: ConditionGuard.Or } }
    return authType
  }
  private async handleOrConditon(guards: CanActivate[], context: ExecutionContext) {
    let lastError: any = null
    //Điều kiện OR nên chỉ cần 1 Guard Pass qua là được
    for (const instance of guards) {
      try {
        if (await instance.canActivate(context)) {
          return true
        }
      } catch (error) {
        console.log('error', error)

        lastError = error
      }
    }
    if (lastError instanceof HttpException) {
      throw lastError
    } else if (lastError instanceof TokenExpiredError) {
      throw new HttpException(lastError.message, HttpStatus.UNAUTHORIZED)
    }
    throw new UnauthorizedException()
  }

  private handleAndCondition(guards: CanActivate[], context: ExecutionContext) {
    //Điều kiện AND nên cần tất ca 2 Guard Pass qua là được
    for (const instance of guards) {
      try {
        if (!instance.canActivate(context)) {
          throw new UnauthorizedException()
        }
      } catch (error) {
        if (error instanceof HttpException) {
          throw error
        }
        throw new UnauthorizedException()
      }
    }
    return true
  }
}
