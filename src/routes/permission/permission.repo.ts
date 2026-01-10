import { Injectable } from '@nestjs/common'
import {
  GetListPermissionQueryType,
  GetListPermissionsResType,
  GetParamsPermissionType,
  PermissionBodyResType,
  PermissionBodyType,
  PermissionIncludeCreateByAndUpdateByType,
} from './permission.model'
import { PermissionType } from '@/shared/models/shared-permission.model'
import { PrismaService } from '@/shared/service/prisma.service'

@Injectable()
export class PermissionRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async create(body: PermissionBodyType & { createdById: number | null }): Promise<PermissionBodyResType> {
    return await this.prismaService.permission.create({
      data: {
        ...body,
        description: body.description ?? undefined,
        createdById: body.createdById ?? undefined,
      },
    })
  }
  async findUniquePermissionDetail(
    unique: GetParamsPermissionType,
  ): Promise<PermissionIncludeCreateByAndUpdateByType | null> {
    return await this.prismaService.permission.findUnique({
      where: { ...unique, deletedAt: null },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })
  }

  async findManyPermission(
    query: GetListPermissionQueryType & { SortByOrderBy?: any },
  ): Promise<GetListPermissionsResType> {
    const take = query.limit
    const skip = (query.page - 1) * query.limit
    const [data, totalItem] = await Promise.all([
      this.prismaService.permission.findMany({
        where: { deletedAt: null },
        skip,
        take,
        orderBy: query.SortByOrderBy,
      }),
      this.prismaService.permission.count({
        where: { deletedAt: null },
      }),
    ])
    return {
      data,
      totalItem,
      totalPage: Math.ceil(totalItem / query.limit),
      page: query.page || null,
      limit: query.limit || null,
    }
  }

  update({
    data,
    id,
    updatedById,
  }: {
    id: number
    data: Partial<PermissionBodyType>
    updatedById: number | null
  }): Promise<PermissionType & { roles: { id: number }[] }> {
    return this.prismaService.permission.update({
      where: { id, deletedAt: null },
      data: {
        ...data,
        updatedById,
      },
      include: {
        roles: true,
      },
    })
  }
  remove({
    id,
    isHard,
    deletedById,
  }: {
    id: number
    isHard?: boolean
    deletedById?: number
  }): Promise<PermissionType & { roles: { id: number }[] }> {
    return isHard
      ? this.prismaService.permission.update({
          where: { id },
          data: { deletedAt: new Date(), deletedById },
          include: {
            roles: true,
          },
        })
      : this.prismaService.permission.delete({ where: { id, deletedAt: null }, include: { roles: true } })
  }
}
