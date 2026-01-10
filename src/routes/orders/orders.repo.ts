import { NoOrdersToPayException, OrderNotFoundException } from '@/routes/orders/orders.error'
import { OrderQueryType, OrdersListResType, OrderDetailType } from '@/routes/orders/orders.model'
import { OrderStatus, OrderStatusType, PaymentStatus, TypeToOrderStatusType } from '@/shared/constants/order.constant'
import { WS_EVENTS } from '@/shared/constants/others.constant'
import { PrismaService } from '@/shared/service/prisma.service'
import { AppGateway } from '@/webSockets/app.gateway'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class OrdersRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly appGateway: AppGateway,
  ) {}

  async list(query: OrderQueryType): Promise<OrdersListResType> {
    const { limit, page } = query
    const take = limit ?? 10
    const skip = (page - 1) * take
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
    }
    if (query.tableNodeId) {
      where.tableNodeId = query.tableNodeId as number
    }
    if (query.status) {
      where.status = query.status as OrderStatusType
    }
    if (query.type) {
      where.type = query.type as TypeToOrderStatusType
    }
    if (query.search) {
      where.OR = [
        {
          createdBy: {
            name: {
              contains: query.search,
            },
          },
        },
        {
          guest: {
            name: {
              contains: query.search,
            },
          },
        },
        {
          reservation: {
            customerName: {
              contains: query.search,
            },
          },
        },
        {
          voucherSnapshot: {
            code: {
              contains: query.search,
            },
          },
        },
        {
          tableNode: {
            name: {
              contains: query.search,
            },
          },
        },
        {
          updatedBy: {
            name: {
              contains: query.search,
            },
          },
        },
        {
          deletedBy: {
            name: {
              contains: query.search,
            },
          },
        },
      ]
    }

    if (query.fromDate && query.toDate) {
      where.createdAt = {
        gte: new Date(query.fromDate),
        lte: new Date(query.toDate),
      }
    } else if (query.createdAt) {
      where.createdAt = {
        gte: query.createdAt,
      }
    }
    if (query.updatedAt) {
      where.updatedAt = {
        gte: query.updatedAt,
      }
    }
    console.log('where', where)

    const [totalItems, data] = await Promise.all([
      this.prismaService.order.count({
        where,
      }),
      this.prismaService.order.findMany({
        where,
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          createdBy: {
            select: {
              name: true,
              id: true,
            },
          },
          guest: {
            include: {
              tableNode: true,
            },
          },

          payment: {
            select: {
              method: true,
              amount: true,
              status: true,
            },
          },
          tableNode: {
            select: {
              id: true,
              name: true,
            },
          },

          items: {
            include: {
              product: true,
            },
          },
        },
      }),
    ])
    return {
      data: data, // Type assertion for complex Prisma types
      limit,
      page,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    }
  }

  async getById(orderId: number): Promise<OrderDetailType | null> {
    const order = await this.prismaService.order.findUnique({
      where: { id: orderId, deletedAt: null },
      include: {
        createdBy: {
          select: { name: true, id: true },
        },
        guest: {
          omit: {
            refreshToken: true,
            refreshTokenExpiresAt: true,
          },
        },
        payment: {
          select: { method: true, amount: true, status: true },
        },
        tableNode: {
          select: { id: true, name: true },
        },
        items: true,
      },
    })

    if (!order) throw OrderNotFoundException

    return order
  }
  async payOrdersByGuest({
    guestId,
    updatedById,
  }: {
    guestId: number
    updatedById: number
  }): Promise<OrderDetailType[]> {
    const orders = await this.prismaService.order.findMany({
      where: {
        guestId,
        deletedAt: null,
        status: {
          in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY],
        },
      },
    })

    if (orders.length === 0) {
      throw NoOrdersToPayException
    }
    await this.prismaService.$transaction(async (tx) => {
      const ordersIds = orders.map((order) => order.id)
      const paymentsIds = orders.map((order) => order.paymentId)
      await tx.order.updateMany({
        where: {
          id: {
            in: ordersIds,
          },
        },
        data: { status: OrderStatus.PAID, updatedById },
      })
      await tx.payment.updateMany({
        where: {
          id: {
            in: paymentsIds,
          },
        },
        data: {
          status: PaymentStatus.SUCCESS,
          method: 'CASH',
        },
      })
    })

    const [order, sockerRecord] = await Promise.all([
      this.prismaService.order.findMany({
        where: {
          id: {
            in: orders.map((order) => order.id),
          },
        },
        include: {
          createdBy: {
            select: { name: true, id: true },
          },
          guest: {
            omit: {
              refreshToken: true,
              refreshTokenExpiresAt: true,
            },
          },
          payment: {
            select: { method: true, amount: true, status: true },
          },
          tableNode: {
            select: { id: true, name: true },
          },
          items: true,
        },
      }),
      this.prismaService.socket.findFirst({
        where: {
          guestId,
        },
      }),
    ])

    if (sockerRecord) {
      this.appGateway.server.to(sockerRecord.socketId).emit(WS_EVENTS.ORDER_STATUS_UPDATED, {
        message: 'Đơn hàng đã được thanh toán thành công',
        order,
      })
    }

    return order
  }
}
