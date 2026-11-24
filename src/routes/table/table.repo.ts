import { resolveBranchId } from '@/shared/service/branch.resolver'
import {
  CreateTableBodyType,
  TableDetailResType,
  TableListResType,
  UpdateTableBodyType,
} from '@/routes/table/table.model'
import { randomId } from '@/shared/helper'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'
type where = { number: number; deletedAt: null }
@Injectable()
export class TableRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async create(data: CreateTableBodyType & { token: string; createdById: number }): Promise<TableDetailResType['data']> {
    const branchId = await resolveBranchId(this.prismaService, { userId: data.createdById })
    return this.prismaService.table.create({ data: { ...data, branchId } })
  }
  getTableDetail(where: where): Promise<TableDetailResType['data'] | null> {
    return this.prismaService.table.findUnique({ where })
  }

  getTableList(branchId?: number): Promise<TableListResType['data']> {
    return this.prismaService.table.findMany({
      where: {
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
  }
  // updateTable(data: UpdateTableBodyType & { updatedById: number }, where: where): Promise<TableDetailResType['data']> {
  //   if (data.changeToken) {
  //     const token = randomId
  //     //Xóa các rf token của guest theo số bàn, ể tránh tình trạng khách cũ vẫn dùng token cũ truy cập tiếp
  //     return this.prismaService.$transaction(async (tx) => {
  //       const [table] = await Promise.all([
  //         tx.table.update({
  //           where,
  //           data: {
  //             capacity: data.capacity,
  //             status: data.status,
  //             token,
  //             updatedById: data.updatedById,
  //           },
  //         }),
  //         tx.guest.updateMany({
  //           where: {
  //             tableId: where.number,
  //           },
  //           data: {
  //             refreshToken: null,
  //             refreshTokenExpiresAt: null,
  //           },
  //         }),
  //       ])
  //       return table
  //     })
  //   }
  //   return this.prismaService.table.update({
  //     where,
  //     data: {
  //       capacity: data.capacity,
  //       status: data.status,
  //       updatedById: data.updatedById,
  //     },
  //   })
  // }
  // deleteTable({
  //   deletedById,
  //   where,
  //   isHard,
  // }: {
  //   where: where
  //   deletedById: number
  //   isHard?: boolean
  // }): Promise<TableDetailResType['data']> {
  //   return isHard
  //     ? this.prismaService.$transaction(async (tx) => {
  //         const [table] = await Promise.all([
  //           tx.table.update({
  //             where,
  //             data: {
  //               deletedAt: new Date(),
  //               deletedById,
  //             },
  //           }),
  //           tx.guest.updateMany({
  //             where: {
  //               tableId: where.number,
  //             },
  //             data: {
  //               refreshToken: null,
  //               refreshTokenExpiresAt: null,
  //             },
  //           }),
  //         ])
  //         return table
  //       })
  //     : this.prismaService.table.delete({ where })
  // }
}
