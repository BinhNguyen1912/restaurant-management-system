import { AuthType, AuthTypeType, ConditionGuard, ConditionGuardType } from '@/shared/constants/auth.constant'
import { SetMetadata } from '@nestjs/common'

export const AuthKey = 'AuthKey'
export type AuthTypeDecorator = {
  authTypes: AuthTypeType[]
  option: {
    condition: ConditionGuardType
  }
}

//Tao Decorater
export const Auth = (
  authTypes: AuthTypeType[],
  options?: {
    condition?: ConditionGuardType
  },
) =>
  SetMetadata(AuthKey, {
    authTypes,
    option: {
      condition: options?.condition || ConditionGuard.And,
    },
  })

export const IsPublic = () => Auth([AuthType.None])
