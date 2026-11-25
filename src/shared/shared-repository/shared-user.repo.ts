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
  /** Chi nhánh của nhân viên (cho màn hình đăng nhập / header). null = chưa gán chi nhánh */
  findBranchOfUser(userId: number) {
    return this.prismaService.user
      .findUnique({
        where: { id: userId },
        select: { branch: { select: { id: true, code: true, name: true, isActive: true } } },
      })
      .then((user) => user?.branch ?? null)
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
