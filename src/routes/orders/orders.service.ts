import { resolveBranchId } from '@/shared/service/branch.resolver'
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
      // Loc theo chi nhanh cua nguoi dang dang nhap (ADR 0001 D4): don cua chi nhanh khac khong lo ra
      const branchId = await resolveBranchId(this.prismaService, {
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
      // Doc theo id van phai kiem chi nhanh: neu khong, biet id la doc duoc don chi nhanh khac
      const branchId = await resolveBranchId(this.prismaService, {
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
      return await this.sharedOrdersRepo.updateOrder({ data: { ...body, orderId }, updatedById, actorRole })
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
  async payOrdersByGuest({ guestId, updatedById }: { guestId: number; updatedById: number }) {
    try {
      return await this.ordersRepo.payOrdersByGuest({ guestId, updatedById })
    } catch (error) {
      throw error
    }
  }
}
