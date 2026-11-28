import { PrismaService } from '@/shared/service/prisma.service'
import { resolveBranchId, resolveBranchScope } from '@/shared/service/branch.resolver'
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
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { OrderStatus } from '@/shared/constants/order.constant'

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

  async getTableNodeById(TableNodeId: number, actor?: { userId?: number; roleName?: string }) {
    // Bàn của chi nhánh khác vẫn coi như không tồn tại. ADMIN (undefined) xem được mọi chi nhánh.
    const branchId = await resolveBranchScope(this.prismaService, {
      userId: actor?.userId,
      roleName: actor?.roleName,
    })
    const TableNode = await this.sharedTableNodeRepo.GetTableNodeById(TableNodeId, branchId)
    if (!TableNode) throw TableNodeNotFoundException
    return TableNode
  }

  /** Chi nhánh được phép thao tác: ADMIN = mọi chi nhánh (undefined), còn lại ép về chi nhánh mình. */
  private async scopeOf(actor?: { userId?: number; roleName?: string }) {
    return resolveBranchScope(this.prismaService, {
      userId: actor?.userId,
      roleName: actor?.roleName,
    })
  }

  async UpdateTableNode(
    TableNodeId: number,
    { data, updatedById, actor }: { data: UpdateTableNodeBodyType; updatedById: number; actor?: { userId?: number; roleName?: string } },
  ) {
    try {
      const branchId = await this.scopeOf(actor)
      const TableNode = await this.tableNodeRepo.update(TableNodeId, { ...data, updatedById }, branchId)
      return TableNode
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw TableNodeAlreadyExitsException
      }
      if (isNotFoundPrisma(error)) {
        throw TableNodeNotFoundException
      }
      throw error
    }
  }
  /**
   * Nhân viên mở bàn — đây là điều kiện để khách quét QR gọi món.
   *
   * Bàn hỏng / đang ẩn thì không mở được (khách vào sẽ ăn sai bàn). Bàn đã mở rồi thì báo lỗi
   * thay vì âm thầm ghi đè người mở (cần biết ai đang phụ trách bàn).
   */
  async openTable(id: number, openedById: number, actor?: { userId?: number; roleName?: string }) {
    const branchId = await this.scopeOf(actor)
    const table = await this.tableNodeRepo.findById(id, branchId)
    if (!table) throw TableNodeNotFoundException
    if (table.status === 'OUT_OF_SERVICE') throw new BadRequestException('Error.TableBrokenOrUnavailable')
    if (table.status === 'HIDE') throw new BadRequestException('Error.TableIsHidden')

    const opened = await this.tableNodeRepo.open(id, openedById, branchId)
    if (!opened) throw new ConflictException('Error.TableAlreadyOpened')
    return { message: 'Success.TableOpened', data: opened }
  }

  async closeTable(id: number, updatedById: number, actor?: { userId?: number; roleName?: string }) {
    const branchId = await this.scopeOf(actor)
    const table = await this.tableNodeRepo.findById(id, branchId)
    if (!table) throw TableNodeNotFoundException

    // Đóng bàn khi còn đơn CHƯA THU ⇒ doanh thu treo, ca két lệch, và khách mới ngồi vào bàn đó
    // sẽ bị tính chung hoá đơn với người trước.
    const unpaidOrders = await this.prismaService.order.count({
      where: {
        tableNodeId: id,
        deletedAt: null,
        status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY] },
      },
    })
    if (unpaidOrders > 0) throw new BadRequestException('Error.TableHasUnpaidOrders')

    const closed = await this.tableNodeRepo.close(id, updatedById, branchId)
    if (!closed) throw new ConflictException('Error.TableNotOpened')
    return { message: 'Success.TableClosed', data: closed }
  }

  async updateBatch(
    data: UpdateTableNodeBodyBatchType,
    updatedById: number,
    actor?: { userId?: number; roleName?: string },
  ) {
    const branchId = await this.scopeOf(actor)
    return await this.tableNodeRepo.updateBatch({ data, updatedById, branchId })
  }

  async getList(query: TableNodeQueryType, actor?: { userId?: number; roleName?: string }) {
    // READ: ADMIN thấy sơ đồ bàn của mọi chi nhánh
    const branchId = await this.scopeOf(actor)
    return await this.tableNodeRepo.list({ ...query, branchId })
  }
  async delete({
    TableNodeId,
    deletedById,
    actor,
  }: {
    TableNodeId: number
    deletedById: number
    actor?: { userId?: number; roleName?: string }
  }) {
    const branchId = await this.scopeOf(actor)
    return await this.tableNodeRepo.delete({ TableNodeId, deletedById, isHard: true, branchId })
  }
  async deleteAllByArea(areaId: number, actor?: { userId?: number; roleName?: string }) {
    const branchId = await this.scopeOf(actor)
    return await this.tableNodeRepo.deleteAllByArea({ areaId, branchId })
  }
}
