import { resolveBranchId } from '@/shared/service/branch.resolver'
import {
  AreaBodyType,
  AreaQueryType,
  AreaResType,
  GetListAreaResType,
  UpdateAreaBodyType,
} from '@/routes/area/area.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class AreaRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async create(data: AreaBodyType & { createdById: number; actorRoleName?: string }): Promise<AreaResType> {
    const { actorRoleName, ...areaData } = data
    const branchId = await resolveBranchId(this.prismaService, { userId: data.createdById, roleName: actorRoleName })
    return this.prismaService.area.create({ data: { ...areaData, branchId } })
  }

  update(
    areaId: number,
    data: UpdateAreaBodyType & { updatedById: number },
    branchId?: number,
  ): Promise<AreaResType> {
    return this.prismaService.area.update({
      // Co branchId -> khong sua duoc khu vuc cua chi nhanh khac (Prisma se bao khong tim thay)
      where: { id: areaId, deletedAt: null, ...(branchId ? { branchId } : {}) },
      data: {
        ...data,
        updatedById: data.updatedById,
      },
    })
  }
  async list(query: AreaQueryType, branchId?: number): Promise<GetListAreaResType> {
    const take = query.limit
    const skip = (query.page - 1) * query.limit
    // Loc theo chi nhanh: khu vuc cua chi nhanh khac khong duoc lo ra
    const where = { deletedAt: null, ...(branchId ? { branchId } : {}) }
    const [data, totalItems] = await Promise.all([
      this.prismaService.area.findMany({ where, take, skip }),
      this.prismaService.area.count({ where }),
    ])
    return {
      data,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
      page: query.page,
      limit: query.limit,
    }
  }
  GetAreaById(areaId: number, branchId?: number): Promise<AreaResType | null> {
    return this.prismaService.area.findFirst({
      where: { id: areaId, deletedAt: null, ...(branchId ? { branchId } : {}) },
    })
  }
  delete({
    areaId,
    isHard,
    deletedById,
    branchId,
  }: {
    areaId: number
    isHard?: boolean
    deletedById?: number
    branchId?: number
  }): Promise<AreaResType> {
    const where = { id: areaId, deletedAt: null, ...(branchId ? { branchId } : {}) }
    return isHard
      ? this.prismaService.area.update({
          where,
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        })
      : this.prismaService.area.delete({ where })
  }
}
