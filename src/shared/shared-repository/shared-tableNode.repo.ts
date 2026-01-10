import { Injectable } from '@nestjs/common'
import { PrismaService } from '../service/prisma.service'
import { TableNodeDetailResType, TableNodeType } from '../models/shared-tableNode.model'

@Injectable()
export class SharedTableNodeRepo {
  constructor(private readonly prismaService: PrismaService) {}

  GetTableNodeById(TableNodeId: number): Promise<TableNodeDetailResType | null> {
    return this.prismaService.tableNode.findUnique({
      where: { id: TableNodeId, deletedAt: null },
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
