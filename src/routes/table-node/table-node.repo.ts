import { resolveBranchId } from '@/shared/service/branch.resolver'
import { TableNodeDetailResDTO } from '@/routes/table-node/table-node.dtos'
import {
  GetListTableNodeResType,
  TableNodeBodyType,
  TableNodeQueryType,
  UpdateTableNodeBodyBatchResType,
  UpdateTableNodeBodyBatchType,
  UpdateTableNodeBodyType,
} from '@/routes/table-node/table-node.model'
import { randomId } from '@/shared/helper'
import { TableNodeResType } from '@/shared/models/shared-tableNode.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class TableNodeRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async create(data: TableNodeBodyType & { createdById: number; token: string }): Promise<TableNodeResType> {
    const branchId = await resolveBranchId(this.prismaService, { userId: data.createdById })
    return this.prismaService.tableNode.create({
      data: { ...data, branchId },
    })
  }

  /**
   * Cập nhật bàn. `branchId` (khi người gọi KHÔNG phải ADMIN) luôn nằm trong `where`:
   * trước đây chỉ lọc theo `id`, nên STAFF chi nhánh A đổi tên/trạng thái/xoá được bàn chi nhánh B.
   */
  update(
    tableNodeId: number,
    data: UpdateTableNodeBodyType & { updatedById: number },
    branchId?: number,
  ): Promise<TableNodeResType> {
    const scope = branchId ? { branchId } : {}
    if (data.changeToken) {
      const token = randomId()
      //XÓA CÁC RT TRONG GUEST THEO SỐ BÀN TRÁNH SỬ DỤNG TOKEN CŨ ĐỂ TRUY CẬP TIẾP
      const resuft = this.prismaService.$transaction(async (tx) => {
        const [tableNode] = await Promise.all([
          tx.tableNode.update({
            where: { id: tableNodeId, deletedAt: null, ...scope },
            data: {
              areaId: data.areaId,
              height: data.height,
              imageUrl: data.imageUrl,
              layoutId: data.layoutId,
              name: data.name,
              positionX: data.positionX,
              positionY: data.positionY,
              status: data.status,
              width: data.width,
              type: data.type,
              rotation: data.rotation,
              token,
              updatedById: data.updatedById,
              seats: data.seats,
            },
          }),
          tx.guest.updateMany({
            where: { tableNodeId, deletedAt: null },
            data: {
              refreshToken: null,
              refreshTokenExpiresAt: null,
            },
          }),
        ])
        return tableNode
      })
      return resuft
    }
    return this.prismaService.tableNode.update({
      where: { id: tableNodeId, deletedAt: null, ...scope },
      data: {
        areaId: data.areaId,
        height: data.height,
        imageUrl: data.imageUrl,
        layoutId: data.layoutId,
        name: data.name,
        positionX: data.positionX,
        positionY: data.positionY,
        status: data.status,
        width: data.width,
        type: data.type,
        rotation: data.rotation,
        updatedById: data.updatedById,
        seats: data.seats,
      },
    })
  }

  async updateBatch({
    updatedById,
    data,
    branchId,
  }: {
    data: UpdateTableNodeBodyBatchType
    updatedById: number
    branchId?: number
  }): Promise<UpdateTableNodeBodyBatchResType> {
    const hihi = await this.prismaService.$transaction(async (tx) => {
      return await Promise.all(
        data.map(async (a) => {
          const { id, ...updateData } = a
          return this.update(id, { ...updateData, updatedById }, branchId)
        }),
      )
    })
    return {
      data: hihi,
    }
  }
  async list(query: TableNodeQueryType & { branchId?: number }): Promise<GetListTableNodeResType> {
    const take = query.limit || 10
    const skip = ((query.page || 1) - 1) * take

    // Lọc theo areaId nếu có
    const where: any = { deletedAt: null }
    if (query.areaId) {
      where.areaId = query.areaId
    }
    if (query.branchId) {
      where.branchId = query.branchId
    }

    const [data, totalItems] = await Promise.all([
      this.prismaService.tableNode.findMany({
        where,
        include: {
          area: {
            select: { name: true },
          },
          layout: {
            select: { name: true, status: true },
          },
        },
        take,
        skip,
      }),
      this.prismaService.tableNode.count({ where }),
    ])

    return {
      data,
      totalItems,
      totalPages: Math.ceil(totalItems / take),
      page: query.page || 1,
      limit: take,
    }
  }

  delete({
    TableNodeId,
    isHard,
    deletedById,
    branchId,
  }: {
    TableNodeId: number
    isHard?: boolean
    deletedById?: number
    branchId?: number
  }): Promise<TableNodeResType> {
    const scope = branchId ? { branchId } : {}
    return isHard
      ? this.prismaService.tableNode.update({
          where: { id: TableNodeId, deletedAt: null, ...scope },
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        })
      : this.prismaService.tableNode.delete({ where: { id: TableNodeId, deletedAt: null, ...scope } })
  }

  deleteAllByArea({ areaId, branchId }: { areaId: number; branchId?: number }) {
    return this.prismaService.tableNode.deleteMany({
      where: { areaId, deletedAt: null, ...(branchId ? { branchId } : {}) },
    })
  }

  /**
   * Mở bàn: đặt OCCUPIED + ghi ai mở, lúc nào. Điều kiện `openedAt: null` để hai nhân viên bấm
   * cùng lúc không ghi đè nhau (bấm lần 2 trả về null -> service báo "bàn đã mở").
   */
  async open(id: number, openedById: number, branchId?: number) {
    const { count } = await this.prismaService.tableNode.updateMany({
      where: {
        id,
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        openedAt: null,
        status: { in: ['AVAILABLE', 'RESERVED'] },
      },
      data: { status: 'OCCUPIED', openedAt: new Date(), openedById, updatedById: openedById },
    })
    if (count === 0) return null
    return this.prismaService.tableNode.findUnique({ where: { id } })
  }

  /**
   * Đóng bàn: trả về AVAILABLE và xoá phiên (khách quét lại phải nhờ nhân viên mở).
   *
   * Chỉ đóng được phiên ĐANG MỞ (`openedAt != null`) của bàn thuộc chi nhánh mình: ghi đè vô điều
   * kiện sẽ (a) biến bàn `OUT_OF_SERVICE`/`HIDE` thành bàn bán được, (b) xoá phiên mà thu ngân khác
   * vừa mở. `null` = không có gì để đóng.
   */
  async close(id: number, updatedById: number, branchId?: number) {
    const { count } = await this.prismaService.tableNode.updateMany({
      where: {
        id,
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        openedAt: { not: null },
        status: { in: ['OCCUPIED', 'RESERVED'] },
      },
      data: { status: 'AVAILABLE', openedAt: null, openedById: null, updatedById },
    })
    if (count === 0) return null
    return this.prismaService.tableNode.findUnique({ where: { id } })
  }

  findById(id: number, branchId?: number) {
    return this.prismaService.tableNode.findUnique({
      where: { id, deletedAt: null, ...(branchId ? { branchId } : {}) },
    })
  }
}
