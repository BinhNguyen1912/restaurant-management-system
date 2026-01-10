import { REQUEST_ROLE_KEY } from '@/shared/constants/role.constant'
import { RolePermissionsType } from '@/shared/models/shared-role.model'
import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const ActiveRole = createParamDecorator(
  (field: keyof RolePermissionsType | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest()
    const role = req[REQUEST_ROLE_KEY]
    return field ? role?.[field] : role
  },
)
