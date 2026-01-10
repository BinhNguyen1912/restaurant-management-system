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

  create(data: AreaBodyType & { createdById: number }): Promise<AreaResType> {
    return this.prismaService.area.create({ data })
  }

  update(areaId: number, data: UpdateAreaBodyType & { updatedById: number }): Promise<AreaResType> {
    return this.prismaService.area.update({
      where: { id: areaId, deletedAt: null },
      data: {
        ...data,
        updatedById: data.updatedById,
      },
    })
  }
  async list(query: AreaQueryType): Promise<GetListAreaResType> {
    const take = query.limit
    const skip = (query.page - 1) * query.limit
    const [data, totalItems] = await Promise.all([
      this.prismaService.area.findMany({ where: { deletedAt: null }, take, skip }),
      this.prismaService.area.count({ where: { deletedAt: null } }),
    ])
    return {
      data,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
      page: query.page,
      limit: query.limit,
    }
  }
  GetAreaById(areaId: number): Promise<AreaResType | null> {
    return this.prismaService.area.findUnique({ where: { id: areaId, deletedAt: null } })
  }
  delete({
    areaId,
    isHard,
    deletedById,
  }: {
    areaId: number
    isHard?: boolean
    deletedById?: number
  }): Promise<AreaResType> {
    return isHard
      ? this.prismaService.area.update({
          where: { id: areaId, deletedAt: null },
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        })
      : this.prismaService.area.delete({ where: { id: areaId, deletedAt: null } })
  }
}
