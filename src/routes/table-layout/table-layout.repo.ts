import {
  GetListTableLayoutResType,
  TableLayoutBodyType,
  TableLayoutQueryType,
  TableLayoutResType,
  UpdateTableLayoutBodyType,
} from '@/routes/table-layout/table-layout.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class TableLayoutRepo {
  constructor(private readonly prismaService: PrismaService) {}

  create(data: TableLayoutBodyType & { createdById: number }): Promise<TableLayoutResType> {
    return this.prismaService.tableLayout.create({ data })
  }

  update(
    TableLayoutId: number,
    data: UpdateTableLayoutBodyType & { updatedById: number },
  ): Promise<TableLayoutResType> {
    return this.prismaService.tableLayout.update({
      where: { id: TableLayoutId, deletedAt: null },
      data: {
        ...data,
        updatedById: data.updatedById,
      },
    })
  }
  async list(query: TableLayoutQueryType): Promise<GetListTableLayoutResType> {
    const take = query.limit
    const skip = (query.page - 1) * query.limit
    const [data, totalItems] = await Promise.all([
      this.prismaService.tableLayout.findMany({
        where: { deletedAt: null },
        include: {
          area: {
            select: {
              name: true,
            },
          },
        },
        take,
        skip,
      }),
      this.prismaService.tableLayout.count({ where: { deletedAt: null } }),
    ])
    return {
      data,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
      page: query.page,
      limit: query.limit,
    }
  }
  GetTableLayoutById(TableLayoutId: number): Promise<TableLayoutResType | null> {
    return this.prismaService.tableLayout.findUnique({
      where: { id: TableLayoutId, deletedAt: null },
      include: {
        area: {
          select: {
            name: true,
          },
        },
      },
    })
  }
  delete({
    TableLayoutId,
    isHard,
    deletedById,
  }: {
    TableLayoutId: number
    isHard?: boolean
    deletedById?: number
  }): Promise<TableLayoutResType> {
    return isHard
      ? this.prismaService.tableLayout.update({
          where: { id: TableLayoutId, deletedAt: null },
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        })
      : this.prismaService.tableLayout.delete({ where: { id: TableLayoutId, deletedAt: null } })
  }
}
