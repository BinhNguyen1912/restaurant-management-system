import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
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
    /** Transaction client thật (không phải `any`) để TypeScript bắt được tên trường sai */
    tx: Prisma.TransactionClient
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

    /**
     * 2. Kết thúc phiên của khách.
     *
     * Trước đây chỗ này ghi `isClosed: true` — **trường không tồn tại** trong model `Guest`, nên
     * đường thanh toán VNPay cho đơn tại bàn sẽ ném lỗi ngay sau khi đã giải phóng bàn (bàn trống
     * nhưng transaction coi như thất bại). TypeScript không bắt được vì `tx` khai báo `any`.
     *
     * Cách đúng với schema hiện có: **vô hiệu hoá phiên** bằng cách xoá refresh token. Khách vào
     * lại phải quét QR (và bàn phải được nhân viên mở lại).
     */
    const guestId = orders[0]?.guestId
    if (guestId) {
      await tx.guest.updateMany({
        where: { id: guestId },
        data: { refreshToken: null, refreshTokenExpiresAt: null },
      })
      console.log(`Guest ${guestId} session invalidated after payment.`)
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
    /** Transaction client thật (không phải `any`) để TypeScript bắt được tên trường sai */
    tx: Prisma.TransactionClient
  }) {
    console.log('--- AT_TABLE: Starting specific business logic (Failure) ---')
    // Thanh toán tại bàn thất bại, Order status vẫn giữ nguyên (PAID/COMPLETED/PENDING)
    // Không cần thay đổi trạng thái Order hay Bàn, chỉ cần update Payment status (đã làm ở Service)

    // Tùy chọn: Ghi log thất bại chi tiết hơn
    console.log('--- AT_TABLE: Business logic finished ---')
  }
}
