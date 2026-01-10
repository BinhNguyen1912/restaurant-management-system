import { CACHE_KEYS } from '@/cache/cache.constant'
import { CacheService } from '@/cache/services/cache.service'
import { GetRoleWithPermissionResType } from '@/routes/role/role.model'
import { REQUEST_USER_KEY } from '@/shared/constants/auth.constant'
import { REQUEST_ROLE_KEY } from '@/shared/constants/role.constant'
import { PrismaService } from '@/shared/service/prisma.service'
import { TokenService } from '@/shared/service/token.service'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common'
import { Cache } from 'cache-manager'
import { keyBy } from 'lodash'
import { RolePermissionsType } from '../models/shared-role.model'
type Permission = GetRoleWithPermissionResType['permissions'][number]
type CacheRole = GetRoleWithPermissionResType & {
  permissions: {
    [key: string]: Permission
  }
}
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prismaService: PrismaService,
    private readonly cacheService: CacheService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const path = request.route.path
    const method = request.method

    const decodeAT = await this.extractAndValidationTokenFromHeader(request)
    const { roleId } = decodeAT
    const cacheRoleKey = CACHE_KEYS.ROLE(roleId)
    let cacheRole = await this.cacheService.get<CacheRole>(cacheRoleKey)
    if (cacheRole == null) {
      const role = (await this.prismaService.role
        .findFirstOrThrow({
          where: { id: roleId, deletedAt: null },
          include: {
            permissions: {
              where: {
                deletedAt: null,
              },
            },
          },
        })
        .catch(() => {
          throw new ForbiddenException()
        })) as unknown as RolePermissionsType
      const permissionObject = keyBy(role.permission, (p) => `${p.method}:${p.path}`) as CacheRole['permissions']
      cacheRole = {
        ...role,
        permissions: permissionObject,
      }
      await this.cacheService.set(cacheRoleKey, cacheRole, 1000 * 60 * 60)
      request[REQUEST_ROLE_KEY] = role
    }

    const canAccess: Permission | undefined = cacheRole.permissions[`${method}:${path}`]
    // if (!canAccess) throw new ForbiddenException()

    request[REQUEST_USER_KEY] = decodeAT
    return true
  }

  extractTokenFromHeader(request: any): string {
    const accessToken = request.headers.authorization?.split(' ')[1]
    if (!accessToken) {
      throw new HttpException('Error.MissingAccessToken', HttpStatus.UNAUTHORIZED)
    }
    return accessToken
  }

  async extractAndValidationTokenFromHeader(request: any): Promise<AccessTokenPayload> {
    const accessToken = this.extractTokenFromHeader(request)
    const decodeAccessToken = await this.tokenService.VerifyAccessToken(accessToken)
    if (!decodeAccessToken) {
      throw new HttpException('Error.InvalidAccessToken', HttpStatus.UNAUTHORIZED)
    }
    return decodeAccessToken
  }
}
