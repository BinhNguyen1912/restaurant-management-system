import { resolveBranchId, resolveBranchScope } from '@/shared/service/branch.resolver'
import { TableExitsException, TableNotFoundException } from '@/routes/table/table.error'
import { CreateTableBodyType, UpdateTableBodyType } from '@/routes/table/table.model'
import { TableRepo } from '@/routes/table/table.repo'
import { isNotFoundPrisma, isUniqueConstraintPrisma, randomId } from '@/shared/helper'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'

@Injectable()
export class TableService {
  constructor(
    private readonly tableRepo: TableRepo,
    private readonly prismaService: PrismaService,
  ) {}

  async create(body: CreateTableBodyType, userId: number) {
    const token = randomId()
    try {
      const data = await this.tableRepo.create({ ...body, createdById: userId ?? undefined, token })
      return {
        message: 'create table success',
        data,
      }
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw TableExitsException
      }
      throw error
    }
  }

  async getTableDetail(number: number) {
    try {
      const data = await this.tableRepo.getTableDetail({ number, deletedAt: null })
      if (!data) throw TableNotFoundException
      return {
        message: 'Success.GetTableDetail',
        data,
      }
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw TableNotFoundException
      }
      throw error
    }
  }

  async getListTable(userId?: number) {
    try {
      // READ: ADMIN thấy bàn của mọi chi nhánh (undefined = không lọc)
      const branchId = await resolveBranchScope(this.prismaService, { userId })
      const data = await this.tableRepo.getTableList(branchId)
      return {
        message: 'Success.GetTableList',
        data,
      }
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw TableNotFoundException
      }
      throw error
    }
  }

  // async update(number: number, data: UpdateTableBodyType, userId: number) {
  //   try {
  //     const resuft = await this.tableRepo.updateTable(
  //       {
  //         updatedById: userId ?? undefined,
  //         ...data,
  //       },
  //       { number, deletedAt: null },
  //     )
  //     return {
  //       message: 'Success.UpdateTable',
  //       data: resuft,
  //     }
  //   } catch (error) {
  //     if (isNotFoundPrisma(error)) {
  //       throw TableNotFoundException
  //     }
  //     throw error
  //   }
  // }
  // async delete(number: number, userId: number) {
  //   try {
  //     const data = await this.tableRepo.deleteTable({
  //       where: { deletedAt: null, number },
  //       deletedById: userId ?? undefined,
  //       isHard: false,
  //     })
  //     return {
  //       message: 'Success.DeleteTable',
  //       data,
  //     }
  //   } catch (error) {
  //     if (isNotFoundPrisma(error)) {
  //       throw TableNotFoundException
  //     }
  //     throw error
  //   }
  // }
}
