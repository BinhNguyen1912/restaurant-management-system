import { Injectable } from '@nestjs/common'
import { PostPaymentHandler } from '../service/vnpay.service'
import { PrismaService } from '@/shared/service/prisma.service'
import { OrderType } from '../models/shared-order.model'
import { Request, Response } from 'express'
import { OrderStatus, PaymentStatus } from '@/shared/constants/order.constant'
import { TableStatus } from '../constants/table.constant'

@Injectable()
export class OrderGuestPaymentPaymentHandler implements PostPaymentHandler {
  constructor(private readonly prismaService: PrismaService) {}

  async handleSuccess({
    orders,
    vnpTxnRef,
    vnpBankCode,
    amount,
    tx,
  }: {
    orders: OrderType[]
    vnpTxnRef: string
    vnpBankCode?: string
    amount: number
    tx: any // Prisma Transaction Client
  }): Promise<void> {
    console.log('--- AT_TABLE: Starting specific business logic (Success) ---')

    // 1. Logic nghiệp vụ: Giải phóng Bàn (Chỉ cần lấy 1 order để xác định bàn)
    const tableNodeId = orders[0]?.tableNodeId
    if (tableNodeId) {
      await tx.tableNode.update({
        where: { id: tableNodeId },
        data: {
          status: TableStatus.AVAILABLE,
          // đóng phiên bàn: khách quét QR lại sẽ phải nhờ nhân viên mở bàn
          openedAt: null,
          openedById: null,
        },
      })
      console.log(`Table ${tableNodeId} status updated to CLEANING after payment.`)
    }

    // 2. Logic nghiệp vụ: Đóng/Archive Guest (Tùy chọn)
    // Nếu đây là lần thanh toán cuối cùng, có thể đóng Guest
    const guestId = orders[0]?.guestId
    if (guestId) {
      await tx.guest.update({
        where: { id: guestId },
        data: {
          isClosed: true,
          // Có thể thêm log/metadata về thời gian thanh toán cuối
        },
      })
      console.log(`Guest ${guestId} session closed after payment.`)
    }

    // Ghi chú: Cập nhật Payment/Order Status CHUNG đã được VnPayService xử lý
    console.log('--- AT_TABLE: Business logic finished ---')
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
    console.log('--- AT_TABLE: Starting specific business logic (Failure) ---')
    // Thanh toán tại bàn thất bại, Order status vẫn giữ nguyên (PAID/COMPLETED/PENDING)
    // Không cần thay đổi trạng thái Order hay Bàn, chỉ cần update Payment status (đã làm ở Service)

    // Tùy chọn: Ghi log thất bại chi tiết hơn
    console.log('--- AT_TABLE: Business logic finished ---')
  }
}
