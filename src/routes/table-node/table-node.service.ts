import { PrismaService } from '@/shared/service/prisma.service'
import { resolveBranchId } from '@/shared/service/branch.resolver'
import { TableNodeAlreadyExitsException, TableNodeNotFoundException } from '@/routes/table-node/table-node.error'
import {
  TableNodeBodyType,
  TableNodeQueryType,
  UpdateTableNodeBodyType,
  UpdateTableNodeBodyBatchType,
} from '@/routes/table-node/table-node.model'
import { TableNodeRepo } from '@/routes/table-node/table-node.repo'
import { isNotFoundPrisma, isUniqueConstraintPrisma, randomId } from '@/shared/helper'
import { SharedTableNodeRepo } from '@/shared/shared-repository/shared-tableNode.repo'
import { Injectable } from '@nestjs/common'

@Injectable()
export class TableNodeService {
  constructor(
    private readonly tableNodeRepo: TableNodeRepo,
    private readonly sharedTableNodeRepo: SharedTableNodeRepo,
    private readonly prismaService: PrismaService,
  ) {}
  private generateToken(): string {
    return crypto.randomUUID().replace(/-/g, '')
  }

  async create({ createdById, data }: { data: TableNodeBodyType; createdById: number }) {
    try {
      const token = this.generateToken()
      return await this.tableNodeRepo.create({
        ...data,
        token,
        createdById,
      })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        console.log('error', error)
        throw TableNodeAlreadyExitsException
      }
    }
  }

  async getTableNodeById(TableNodeId: number) {
    const TableNode = await this.sharedTableNodeRepo.GetTableNodeById(TableNodeId)
    if (!TableNode) throw TableNodeNotFoundException
    return TableNode
  }

  async UpdateTableNode(
    TableNodeId: number,
    { data, updatedById }: { data: UpdateTableNodeBodyType; updatedById: number },
  ) {
    try {
      const TableNode = await this.tableNodeRepo.update(TableNodeId, { ...data, updatedById })
      return TableNode
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw TableNodeAlreadyExitsException
      }
      if (isNotFoundPrisma(error)) {
        throw TableNodeNotFoundException
      }
    }
  }
  async updateBatch(data: UpdateTableNodeBodyBatchType, updatedById: number) {
    return await this.tableNodeRepo.updateBatch({ data, updatedById })
  }

  async getList(query: TableNodeQueryType, userId?: number) {
    const branchId = await resolveBranchId(this.prismaService, { userId })
    return await this.tableNodeRepo.list({ ...query, branchId })
  }
  async delete({ TableNodeId, deletedById }: { TableNodeId: number; deletedById: number }) {
    return await this.tableNodeRepo.delete({ TableNodeId, deletedById, isHard: true })
  }
  async deleteAllByArea(areaId: number) {
    return await this.tableNodeRepo.deleteAllByArea({ areaId })
  }
}
