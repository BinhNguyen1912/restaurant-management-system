import { Injectable } from '@nestjs/common'
import { PrismaService } from '../service/prisma.service'
import { TableNodeDetailResType, TableNodeType } from '../models/shared-tableNode.model'

@Injectable()
export class SharedTableNodeRepo {
  constructor(private readonly prismaService: PrismaService) {}

  GetTableNodeById(TableNodeId: number, branchId?: number): Promise<TableNodeDetailResType | null> {
    return this.prismaService.tableNode.findFirst({
      where: { id: TableNodeId, deletedAt: null, ...(branchId ? { branchId } : {}) },
      include: {
        area: {
          select: {
            name: true,
          },
        },
        layout: {
          select: {
            name: true,
            status: true,
          },
        },
      },
    })
  }
}
