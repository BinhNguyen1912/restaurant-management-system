import { resolveBranchIdByGuest } from '@/shared/service/branch.resolver'
import { toMoneyNumbers } from '@/shared/service/money-serializer'
import { NoOrdersToPayException, OrderNotFoundException } from '@/routes/orders/orders.error'
import { OrderQueryType, OrdersListResType, OrderDetailType } from '@/routes/orders/orders.model'
import {
  OrderStatus,
  OrderStatusType,
  PaymentMethod,
  PaymentStatus,
  TypeToOrderStatusType,
} from '@/shared/constants/order.constant'
import { isSameAmount } from '@/shared/service/payment-hardening'
import { LedgerPostingService } from '@/shared/service/ledger-posting.service'
import { buildOrderLedgerLines } from '@/shared/service/order-ledger-lines'
import { WS_EVENTS } from '@/shared/constants/others.constant'
import { PrismaService } from '@/shared/service/prisma.service'
import { AppGateway } from '@/webSockets/app.gateway'
import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class OrdersRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly ledgerPosting: LedgerPostingService,
    private readonly appGateway: AppGateway,
  ) {}

  async list(query: OrderQueryType & { branchId?: number }): Promise<OrdersListResType> {
    const { limit, page } = query
    const take = limit ?? 10
    const skip = (page - 1) * take
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
    }
    if (query.branchId) {
      where.branchId = query.branchId as number
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
      data: toMoneyNumbers(data), // Type assertion for complex Prisma types
      limit,
      page,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    }
  }

  async getById(orderId: number, branchId?: number): Promise<OrderDetailType | null> {
    const order = await this.prismaService.order.findFirst({
      // Có branchId -> đơn của chi nhánh khác trả về "không tìm thấy" thay vì lộ dữ liệu
      where: { id: orderId, deletedAt: null, ...(branchId ? { branchId } : {}) },
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

    return toMoneyNumbers(order)
  }
  async payOrdersByGuest({
    guestId,
    updatedById,
  }: {
    guestId: number
    updatedById: number
  }): Promise<OrderDetailType[]> {
    // Token GUEST mang userId = Guest.id -> KHONG tra bang User (co the khop nham nhan vien
    // cua chi nhanh khac). Lay chi nhanh tu ban khach dang ngoi.
    const branchId = await resolveBranchIdByGuest(this.prismaService, guestId)

    const orders = await this.prismaService.order.findMany({
      where: {
        guestId,
        deletedAt: null,
        // Không cho thu tiền đơn của chi nhánh khác
        branchId,
        status: {
          in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY],
        },
      },
      include: { payment: true },
    })

    if (orders.length === 0) {
      throw NoOrdersToPayException
    }
    // Chi thu tien khi so tien phai thu khop voi so tien da ghi tren Payment (ADR 0001 D7).
    // Lech (vd: don da dat coc) -> khong duoc danh dau da thanh toan.
    const mismatched = orders.filter((order) => !isSameAmount(order.payment.amount, order.grandTotal))
    if (mismatched.length > 0) {
      throw new BadRequestException(
        `Số tiền không khớp ở đơn ${mismatched.map((order) => `#${order.id} (phải thu ${order.grandTotal}, đã ghi ${order.payment.amount})`).join(', ')}. Không thể ghi nhận thanh toán.`,
      )
    }

    await this.prismaService.$transaction(async (tx) => {
      const ordersIds = orders.map((order) => order.id)
      const paymentsIds = orders.map((order) => order.paymentId)
      // Chi chuyen don dang mo -> PAID; neu so dong khong khop thi rollback (tranh PAID + Payment FAILED)
      const updatedOrders = await tx.order.updateMany({
        where: {
          id: {
            in: ordersIds,
          },
          status: {
            in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY],
          },
        },
        data: { status: OrderStatus.PAID, updatedById },
      })
      if (updatedOrders.count !== ordersIds.length) {
        throw new BadRequestException('Trạng thái đơn đã thay đổi trong lúc thu tiền. Vui lòng thử lại.')
      }
      // Chi chuyen tu PENDING -> SUCCESS, khong keo mot payment REFUNDED ve SUCCESS.
      // Phai kiem so dong: neu payment da FAILED (khach bo VNPay roi tra tien mat) thi update
      // khop 0 dong -> rollback, tranh canh Order=PAID ma Payment=FAILED.
      const updatedPayments = await tx.payment.updateMany({
        where: {
          id: {
            in: paymentsIds,
          },
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.SUCCESS,
          method: PaymentMethod.CASH,
          paidAt: new Date(),
          currency: 'VND',
        },
      })

      if (updatedPayments.count !== paymentsIds.length) {
        throw new BadRequestException(
          'Có phiếu thanh toán không còn ở trạng thái chờ thu (có thể đã thất bại/hủy). Vui lòng kiểm tra lại đơn trước khi thu tiền.',
        )
      }

      // Ghi sổ kép trong CÙNG transaction: thu tiền mà không ghi sổ là điều không xảy ra (ADR 0001 D2).
      // eventKey theo payment => webhook/bấm lại không bao giờ ghi 2 lần.
      for (const order of orders) {
        const lines = buildOrderLedgerLines(
          {
            grandTotal: order.grandTotal,
            subtotal: order.subtotal,
            discountTotal: order.discountTotal,
            serviceChargeAmount: order.serviceChargeAmount,
            taxTotal: order.taxTotal,
          },
          'CASH',
        )
        if (lines.length === 0) continue

        await this.ledgerPosting.postEntry(
          {
            branchId: order.branchId,
            refType: 'ORDER_PAID_CASH',
            refId: order.paymentId,
            idempotencyKey: `cash:payment:${order.paymentId}`,
            memo: `Thu tiền mặt đơn #${order.id}`,
            lines: lines.map((line) => ({ ...line, orderId: order.id, paymentId: order.paymentId })),
          },
          tx,
        )
      }
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

    return toMoneyNumbers(order)
  }
}
