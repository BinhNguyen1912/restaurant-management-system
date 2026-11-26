import { Injectable, Logger } from '@nestjs/common'
import { PostPaymentHandler } from '../service/vnpay.service'
import { PrismaService } from '@/shared/service/prisma.service'
import { OrderType } from '../models/shared-order.model'
import { Prisma, ReservationStatus } from '@prisma/client'
import { OrderStatus } from '../constants/order.constant'
import { ReservationType } from '../models/shared-reservation.model'
import { EmailService } from '../service/email.service'
import { TableStatus } from '../constants/table.constant'

@Injectable()
export class ReservationPaymentHandler implements PostPaymentHandler {
  private readonly logger = new Logger(ReservationPaymentHandler.name)

  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async handleSuccess({
    orders,
    vnpTxnRef,
    vnpBankCode,
    amount,
    tx,
  }: {
    orders: any[]
    vnpTxnRef: string
    vnpBankCode?: string
    amount: number
    /** Transaction client thật: `any` sẽ che mất tên trường sai (xem handler-typing.spec.ts) */
    tx: Prisma.TransactionClient
  }): Promise<void> {
    const reservationId = orders[0]?.reservationId
    const user = orders[0]?.user || orders[0]?.guest
    const tableNodeId = orders[0]?.tableNodeId
    console.log('reservationId', reservationId)

    if (reservationId) {
      const reservation: ReservationType = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.DEPOSITED,
        },
      })
      await tx.tableNode.update({
        where: {
          id: tableNodeId,
        },
        data: {
          status: TableStatus.RESERVED,
        },
      })
      await this.emailService.sendConfirmReservation(reservation, user.email)
    }
  }

  async handleFailure({
    orders,
    vnpTxnRef,
    tx,
  }: {
    orders: OrderType[]
    vnpTxnRef: string
    /** Transaction client thật để TypeScript bắt được tên trường sai (xem OrderPayment.handler) */
    tx: Prisma.TransactionClient
  }) {
    // 1. Logic nghiệp vụ: Hủy Lịch hẹn (Reservation)
    const reservationId = orders[0]?.reservationId
    if (reservationId) {
      /**
       * `Reservation` KHÔNG có cột `cancelReason` — trước đây chỗ này ghi vào đó nên mọi lần
       * thanh toán cọc VNPAY thất bại đều ném lỗi ngay tại đây (`tx` khai báo `any` nên
       * TypeScript không bắt được). Chỉ đổi trạng thái; lý do ghi ra log để còn tra.
       */
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.CANCELLED },
      })
      this.logger.warn(
        `Reservation #${reservationId} cancelled: VNPAY deposit payment failed (txn ${vnpTxnRef}).`,
      )
    }

    // 2. Logic nghiệp vụ: Hủy Order
    // Order status đã được cập nhật thành CANCELED/PENDING, tùy vào logic khởi tạo ban đầu.
    // Nếu bạn muốn hủy Order, hãy thêm vào đây:
    await tx.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { status: OrderStatus.CANCELLED },
    })

    console.log('--- RESERVATION: Business logic finished ---')
  }
}
