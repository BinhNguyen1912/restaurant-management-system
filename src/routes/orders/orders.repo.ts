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
import { CogsService } from '@/shared/service/cogs.service'
import { buildOrderLedgerLines } from '@/shared/service/order-ledger-lines'
import { computeDepositSettlementAmount } from '@/shared/service/deposit-settlement'
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
    private readonly cogsService: CogsService,
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
    method = 'CASH',
    note,
  }: {
    guestId: number
    updatedById: number
    method?: 'CASH'
    note?: string
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
      include: { payment: true, reservation: { select: { depositAmount: true } } },
    })

    if (orders.length === 0) {
      throw NoOrdersToPayException
    }
    // Chi thu tien khi so tien phai thu khop voi so tien da ghi tren Payment (ADR 0001 D7).
    // Don da dat coc thi phai thu = grandTotal - coc da dung, khong phai grandTotal.
    const depositByOrderId = new Map<number, { settled: Prisma.Decimal; outstanding: Prisma.Decimal }>()
    for (const order of orders) {
      const depositAmount = order.reservation?.depositAmount ?? null
      // Coc chi duoc tinh khi da THAT SU thu duoc (Payment cua don la SUCCESS). Chua thu thi ca
      // hoa don van phai thu qua Payment cu, khong duoc tru mot khoan tien chua vao ket.
      const depositCollected = order.payment.status === PaymentStatus.SUCCESS
      const settled = depositCollected ? computeDepositSettlementAmount(depositAmount, order.grandTotal) : new Prisma.Decimal(0)
      const outstanding = new Prisma.Decimal(order.grandTotal).minus(settled)
      depositByOrderId.set(order.id, { settled, outstanding })
    }
    // Chi doi chieu voi Payment cu khi don CHUA co coc da thu: luc do toan bo hoa don di qua Payment do.
    // Don da coc thi Payment dang giu tien coc, con lai thu bang mot Payment moi nen so tien khac la dung.
    const mismatched = orders.filter((order) => {
      const m = depositByOrderId.get(order.id)!
      return m.settled.isZero() && !isSameAmount(order.payment.amount, m.outstanding)
    })
    if (mismatched.length > 0) {
      throw new BadRequestException(
        `Số tiền không khớp ở đơn ${mismatched.map((order) => `#${order.id} (còn phải thu ${depositByOrderId.get(order.id)?.outstanding.toString()}, đã ghi ${order.payment.amount})`).join(', ')}. Không thể ghi nhận thanh toán.`,
      )
    }

    await this.prismaService.$transaction(async (tx) => {
      const ordersIds = orders.map((order) => order.id)
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
        throw new BadRequestException('Error.OrderStatusChangedWhilePaying')
      }
      // Chi chuyen tu PENDING -> SUCCESS, khong keo mot payment REFUNDED ve SUCCESS.
      // Phai kiem so dong: neu payment da FAILED (khach bo VNPay roi tra tien mat) thi update
      // khop 0 dong -> rollback, tranh canh Order=PAID ma Payment=FAILED.
      // Payment dang giu coc da SUCCESS thi KHONG BAO GIO lat lai trang thai cua no: don da coc
      // di qua danh sach rieng ben duoi, o day chi con don chua thu dong nao.
      const pendingPaymentsIds = orders
        .filter((o) => depositByOrderId.get(o.id)!.settled.isZero())
        .map((o) => o.paymentId)

      if (pendingPaymentsIds.length > 0) {
        const updatedPayments = await tx.payment.updateMany({
          where: {
            id: {
              in: pendingPaymentsIds,
            },
            status: PaymentStatus.PENDING,
          },
          data: {
            status: PaymentStatus.SUCCESS,
            method: PaymentMethod[method],
            paidAt: new Date(),
            currency: 'VND',
          },
        })

        if (updatedPayments.count !== pendingPaymentsIds.length) {
          throw new BadRequestException('Error.PaymentNotPending')
        }
      }

      // Ghi sổ kép trong CÙNG transaction: thu tiền mà không ghi sổ là điều không xảy ra (ADR 0001 D2).
      // eventKey theo payment => webhook/bấm lại không bao giờ ghi 2 lần.
      for (const order of orders) {
        const { settled, outstanding } = depositByOrderId.get(order.id)!
        const lines = buildOrderLedgerLines(
          {
            grandTotal: order.grandTotal,
            subtotal: order.subtotal,
            discountTotal: order.discountTotal,
            serviceChargeAmount: order.serviceChargeAmount,
            taxTotal: order.taxTotal,
            // Doanh thu thuần: trừ thuế ra khi giá menu đã gồm VAT
            revenue: new Prisma.Decimal(order.grandTotal)
              .minus(order.serviceChargeAmount)
              .minus(order.taxTotal)
              .minus(order.tipAmount),
          },
          'CASH',
          { depositSettled: settled },
        )
        if (lines.length === 0) continue

        // Don da coc va con phai thu: tao mot Payment RIENG cho phan con lai (orderId), coc giu
        // nguyen Payment cu ma ORDER.paymentId dang tro toi. Coc da phu het hoa don thi khong tao gi.
        const collected =
          settled.greaterThan(0) && outstanding.greaterThan(0)
            ? await tx.payment.create({
                data: {
                  amount: outstanding,
                  method: PaymentMethod[method],
                  status: PaymentStatus.SUCCESS,
                  paidAt: new Date(),
                  currency: 'VND',
                  branchId: order.branchId,
                  orderId: order.id,
                },
              })
            : undefined
        // But toan va khoa chong trung phai bam vao dung lan thu tien nay: coc da thu thi la Payment moi.
        const ledgerPaymentId = settled.isZero() ? order.paymentId : collected?.id

        await this.ledgerPosting.postEntry(
          {
            branchId: order.branchId,
            refType: 'ORDER_PAID_CASH',
            refId: ledgerPaymentId ?? order.paymentId,
            idempotencyKey:
              settled.isZero() ? `cash:payment:${ledgerPaymentId}` : `cash:deposit-settle:${ledgerPaymentId ?? order.paymentId}`,
            memo: note?.trim() ? `Thu tiền mặt đơn #${order.id} — ${note.trim()}` : `Thu tiền mặt đơn #${order.id}`,
            lines: lines.map((line) => ({ ...line, orderId: order.id, paymentId: ledgerPaymentId ?? order.paymentId })),
          },
          tx,
        )

        // Tất toán cọc đã nằm trong chính bút toán trên (Nợ DEPOSIT_LIABILITY), không ghi bút toán riêng nữa.
        // Giá vốn đơn này (Nợ COGS / Có INVENTORY) — cùng transaction với thu tiền.
        // Bỏ qua nếu món không có recipe / nguyên liệu chưa khai giá: không bao giờ bịa giá vốn.
        await this.cogsService.postOrderCogs({ orderId: order.id, branchId: order.branchId }, tx)
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
