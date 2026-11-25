import { Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'
import {
  GetRoleParamsType,
  GetRoleQueryType,
  GetRolesResType,
  GetRoleWithPermissionResType,
  RoleBodyResType,
  RoleBodyType,
  UpdateRoleBodyType,
} from './role.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { RoleType } from '@/shared/models/shared-role.model'

@Injectable()
export class RoleRepository {
  constructor(private readonly prismaService: PrismaService) {}
  create(body: RoleBodyType & { createdById: number | null }): Promise<RoleBodyResType> {
    return this.prismaService.role.create({
      data: {
        ...body,
        createdById: body.createdById ?? undefined,
      },
    })
  }
  async getListRoleWithPermission(query: GetRoleQueryType): Promise<GetRolesResType> {
    const take = query.limit
    const skip = (query.page - 1) * query.limit
    const [totalItems, data] = await Promise.all([
      this.prismaService.role.count(),
      this.prismaService.role.findMany({
        where: {
          deletedAt: null,
        },
        skip,
        take,
      }),
    ])
    return {
      data,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
      page: query.page,
      limit: query.limit,
    }
  }

  findRoleByIdWithPermission(id: number): Promise<GetRoleWithPermissionResType | null> {
    return this.prismaService.role.findUnique({
      where: { id, deletedAt: null },
      include: {
        permissions: {
          where: {
            deletedAt: null,
          },
        },
      },
    })
  }

  /** Mọi route trong hệ thống + cờ role này có quyền hay không */
  async permissionMatrix(roleId: number) {
    const [role, all] = await Promise.all([
      this.prismaService.role.findUnique({
        where: { id: roleId, deletedAt: null },
        select: { id: true, name: true, permissions: { where: { deletedAt: null }, select: { id: true } } },
      }),
      this.prismaService.permission.findMany({
        where: { deletedAt: null },
        select: { id: true, method: true, path: true, module: true },
        orderBy: [{ module: 'asc' }, { path: 'asc' }, { method: 'asc' }],
      }),
    ])
    if (!role) return null
    const granted = new Set(role.permissions.map((permission) => permission.id))
    return {
      role: { id: role.id, name: role.name },
      permissions: all.map((permission) => ({ ...permission, granted: granted.has(permission.id) })),
    }
  }

  setPermissions(roleId: number, permissionIds: number[]) {
    return this.prismaService.role.update({
      where: { id: roleId },
      data: { permissions: { set: permissionIds.map((id) => ({ id })) } },
      select: { id: true, name: true, _count: { select: { permissions: true } } },
    })
  }

  async update({
    data,
    id,
    updatedById,
  }: {
    id: number
    data: UpdateRoleBodyType
    updatedById: number
  }): Promise<RoleType> {
    //Kiểm tra nếu có id của permission nào bị xóa mềm thì vẫn không cho update và ném lỗi ra
    //Khi nào người dùng có gửi mảng permission lên

    if (data.permissionIds.length > 0) {
      const ids = data.permissionIds
      const checkIdsOfPermission = await this.prismaService.permission.findMany({
        where: {
          id: {
            in: ids,
          },
        },
      })
      if (checkIdsOfPermission.length !== ids.length)
        throw new UnprocessableEntityException({ message: 'Permissions not found' })

      const deletedPermission = checkIdsOfPermission.filter((item) => item.deletedAt)

      if (deletedPermission.length > 0) {
        const deletedIds = deletedPermission.map((item) => item.id).join(', ')
        throw new UnauthorizedException({
          message: `Permission with id [${deletedIds}] has been deleted`,
        })
      }
    }
    return this.prismaService.role.update({
      where: { id, deletedAt: null },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        permissions: {
          set: data.permissionIds.map((id) => ({ id })),
        },
        updatedById,
      },
      include: {
        permissions: {
          where: {
            deletedAt: null,
          },
        },
      },
    })
  }
  async delete({ id, isHard }: { id: number; isHard?: boolean }) {
    return isHard
      ? await this.prismaService.role.update({
          where: {
            id,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
          },
        })
      : await this.prismaService.role.delete({ where: { id, deletedAt: null } })
  }
}
