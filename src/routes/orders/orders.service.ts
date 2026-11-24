import { resolveBranchId } from '@/shared/service/branch.resolver'
import { BadRequestException, Injectable } from '@nestjs/common'

import { OrdersRepo } from '@/routes/orders/orders.repo'
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
  async list(query: OrderQueryType, userId?: number) {
    try {
      // Loc theo chi nhanh cua nguoi dang dang nhap (ADR 0001 D4): don cua chi nhanh khac khong lo ra
      const branchId = await resolveBranchId(this.prismaService, { userId })
      return await this.ordersRepo.list({ ...query, branchId })
    } catch (error) {
      throw error
    }
  }

  async getById(orderId: number) {
    try {
      return await this.ordersRepo.getById(orderId)
    } catch (error) {
      throw error
    }
  }
  async update({ orderId, body, updatedById }: { orderId: number; body: UpdateOrderType; updatedById: number }) {
    try {
      return await this.sharedOrdersRepo.updateOrder({ data: { ...body, orderId }, updatedById })
    } catch (error) {
      throw error
    }
  }
  async createOrderForGuest({
    guestId,
    orderItems,
    createdById,
  }: {
    guestId: number
    orderItems: CreateNewOrderType
    createdById: number
  }) {
    try {
      return await this.sharedOrdersRepo.CreateOrdersForGuest({ guestId, orderItems, createdById })
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
