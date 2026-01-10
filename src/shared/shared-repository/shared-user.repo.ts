import { GetUserIncludeRoleType, UpdateProfileResType } from '@/routes/auth/auth.model'
import { UpdateUserBodyType } from '@/routes/users/users.model'
import { PermissionType } from '@/shared/models/shared-permission.model'
import { RoleType } from '@/shared/models/shared-role.model'
import { UserType } from '@/shared/models/shared-user.model'
import { HashingService } from '@/shared/service/hashing.service'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

export type UserTypeWithRolePermissions = UserType & { role: RoleType & { permissions: PermissionType[] } }
export type whereUniqueUserType = { id: number } | { email: string }
@Injectable()
export class SharedUserRepo {
  constructor(private readonly prismaService: PrismaService) {}

  findUniqueUser(where: whereUniqueUserType): Promise<UserType | null> {
    return this.prismaService.user.findUnique({
      where: {
        ...where,
        deletedAt: null,
      },
    }) as any
  }
  findUserIncludeRolePermissions(uniqueUser: whereUniqueUserType): Promise<UserTypeWithRolePermissions | null> {
    return this.prismaService.user.findFirst({
      where: {
        ...uniqueUser,
        deletedAt: null,
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    }) as any
  }
  async update(id: number, body: Partial<UserType> & { updatedById?: number }): Promise<UpdateProfileResType> {
    return this.prismaService.user.update({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        ...body,
        updatedById: body.updatedById || null,
      },
    }) as any
  }
}
