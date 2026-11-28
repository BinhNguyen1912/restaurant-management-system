import { resolveBranchId, resolveBranchScope } from '@/shared/service/branch.resolver'
import { BadRequestException, Injectable } from '@nestjs/common'

import { OrdersRepo } from '@/routes/orders/orders.repo'
import { OrderNotFoundException } from '@/routes/orders/orders.error'
import { OrderQueryType } from '@/routes/orders/orders.model'
import { CreateNewOrderType, UpdateOrderType } from '@/shared/models/shared-order.model'
import { SharedOrdersRepo } from '@/shared/shared-repository/shared-orders.repo'
import { PrismaService } from '@/shared/service/prisma.service'

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepo: OrdersRepo,
    private readonly sharedOrdersRepo: SharedOrdersRepo,
    private readonly prismaService: PrismaService,
  ) {}
  async list(query: OrderQueryType, actor?: { userId?: number; roleName?: string }) {
    try {
      /**
       * READ: dùng `resolveBranchScope` (ADMIN -> undefined = **mọi chi nhánh**), không dùng
       * `resolveBranchId`. Hàm sau là resolver cho đường GHI: nó luôn trả đúng 1 chi nhánh và
       * fallback "chi nhánh active đầu tiên", nên ADMIN (branchId = null) chỉ thấy chi nhánh 1 —
       * trong khi báo cáo/tổng quan thấy cả 3. Nhìn như mất dữ liệu.
       */
      const branchId = await resolveBranchScope(this.prismaService, {
        userId: actor?.userId,
        roleName: actor?.roleName,
      })
      return await this.ordersRepo.list({ ...query, branchId })
    } catch (error) {
      throw error
    }
  }

  async getById(orderId: number, actor?: { userId?: number; roleName?: string }) {
    try {
      // Đọc theo id vẫn phải kiểm chi nhánh: không thì biết id là đọc được đơn chi nhánh khác.
      // ADMIN: undefined = không lọc (xem được đơn của mọi chi nhánh).
      const branchId = await resolveBranchScope(this.prismaService, {
        userId: actor?.userId,
        roleName: actor?.roleName,
      })
      const order = await this.ordersRepo.getById(orderId, branchId)
      if (!order) throw OrderNotFoundException
      return order
    } catch (error) {
      throw error
    }
  }
  async update({
    orderId,
    body,
    updatedById,
    actorRole,
  }: {
    orderId: number
    body: UpdateOrderType
    updatedById: number
    actorRole?: string | null
  }) {
    try {
      // GHI cũng phải kiểm chi nhánh: trước đây STAFF chi nhánh A sửa/huỷ được đơn chi nhánh B
      // bằng cách biết `id` (đọc thì đã lọc, ghi thì chưa).
      const branchId = await resolveBranchScope(this.prismaService, { userId: updatedById, roleName: actorRole })
      return await this.sharedOrdersRepo.updateOrder({ data: { ...body, orderId }, updatedById, actorRole, branchId })
    } catch (error) {
      throw error
    }
  }
  async createOrderForGuest({
    guestId,
    orderItems,
    createdById,
    voucherCode,
  }: {
    guestId: number
    orderItems: CreateNewOrderType
    createdById: number
    voucherCode?: string
  }) {
    try {
      return await this.sharedOrdersRepo.CreateOrdersForGuest({ guestId, orderItems, createdById, voucherCode })
    } catch (error) {
      console.log('[ERROR.ORDER-REPO]', error)

      throw error
    }
  }
  async payOrdersByGuest({
    guestId,
    updatedById,
    method = 'CASH',
    note,
  }: {
    guestId: number
    updatedById: number
    method?: 'CASH'
    note?: string
  }) {
    try {
      return await this.ordersRepo.payOrdersByGuest({ guestId, updatedById, method, note })
    } catch (error) {
      throw error
    }
  }
}
