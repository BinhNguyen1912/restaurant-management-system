import {
  TableLayoutAlreadyExitsException,
  TableLayoutNotFoundException,
} from '@/routes/table-layout/table-layout.error'
import {
  TableLayoutBodyType,
  TableLayoutQueryType,
  UpdateTableLayoutBodyType,
} from '@/routes/table-layout/table-layout.model'
import { TableLayoutRepo } from '@/routes/table-layout/table-layout.repo'
import { isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { Injectable } from '@nestjs/common'

@Injectable()
export class TableLayoutService {
  constructor(private readonly tableLayoutRepo: TableLayoutRepo) {}
  async create({ createdById, data }: { data: TableLayoutBodyType; createdById: number }) {
    try {
      return await this.tableLayoutRepo.create({
        ...data,
        createdById,
      })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw TableLayoutAlreadyExitsException
      }
    }
  }
  async getTableLayoutById(TableLayoutId: number) {
    const TableLayout = await this.tableLayoutRepo.GetTableLayoutById(TableLayoutId)
    if (!TableLayout) throw TableLayoutNotFoundException
    return TableLayout
  }

  async UpdateTableLayoutById(
    TableLayoutId: number,
    { data, updatedById }: { data: UpdateTableLayoutBodyType; updatedById: number },
  ) {
    try {
      return await this.tableLayoutRepo.update(TableLayoutId, { ...data, updatedById })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw TableLayoutAlreadyExitsException
      }
      if (isNotFoundPrisma(error)) {
        throw TableLayoutNotFoundException
      }
    }
  }
  async getList(query: TableLayoutQueryType) {
    return await this.tableLayoutRepo.list(query)
  }
  async delete({ TableLayoutId, deletedById }: { TableLayoutId: number; deletedById: number }) {
    return await this.tableLayoutRepo.delete({ TableLayoutId, deletedById, isHard: true })
  }
}
