import { Injectable } from '@nestjs/common'
import { PostPaymentHandler } from '../service/vnpay.service'
import { PrismaService } from '@/shared/service/prisma.service'
import { OrderType } from '../models/shared-order.model'
import { ReservationStatus } from '@prisma/client'
import { OrderStatus } from '../constants/order.constant'
import { ReservationType } from '../models/shared-reservation.model'
import { EmailService } from '../service/email.service'
import { TableStatus } from '../constants/table.constant'

@Injectable()
export class ReservationPaymentHandler implements PostPaymentHandler {
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
    tx: any
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
    tx: any // Prisma Transaction Client
  }) {
    // 1. Logic nghiệp vụ: Hủy Lịch hẹn (Reservation)
    const reservationId = orders[0]?.reservationId
    if (reservationId) {
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelReason: 'Payment deposit failed via VNPAY return.',
        },
      })
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
