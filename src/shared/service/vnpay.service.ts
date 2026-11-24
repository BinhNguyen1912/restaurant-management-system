import { toMoneyNumbers } from '@/shared/service/money-serializer'
import { isPaymentAmountMatched, recordWebhookOnce } from '@/shared/service/payment-hardening'
import { isIntentUsable } from '@/shared/service/payment-intent'
import { LedgerPostingService } from '@/shared/service/ledger-posting.service'
import { buildOrderLedgerLines } from '@/shared/service/order-ledger-lines'
import { Injectable, HttpException, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import {
  OrderStatus,
  OrderStatusType,
  PaymentMethod,
  PaymentStatus,
  PaymentStatusType,
  TypeToOrderStatus,
} from '@/shared/constants/order.constant'
import { Request, Response } from 'express'
import * as qs from 'qs'
import * as crypto from 'crypto'
import axios from 'axios'
import moment from 'moment'
import envConfig from '@/shared/config'
import { OrderResForPaymentType } from '@/routes/payment/payment.model'
import { AppGateway } from '@/webSockets/app.gateway'
import {
  ManagerRoom,
  prefixToOrderStatus,
  prefixToOrderStatusType,
  WS_EVENTS,
} from '@/shared/constants/others.constant'
import { log } from 'console'
import { generateForVnp_TxnRef } from '../helper'
import { Prisma } from '@prisma/client'
import { OrderType } from '../models/shared-order.model'
import { OrderGuestPaymentPaymentHandler } from '../handler/OrderPayment.handler'
import { ReservationPaymentHandler } from '../handler/ReservationPayment.handler'

type PrismaTransactionClient = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export interface PostPaymentHandler {
  handleSuccess({
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
    tx: PrismaTransactionClient
  }): Promise<void>

  handleFailure({
    orders,
    vnpTxnRef,
    tx,
  }: {
    orders: OrderType[]
    vnpTxnRef: string
    tx: PrismaTransactionClient
  }): Promise<void>
}

export interface VnPayReturnType {
  vnp_Amount: string
  vnp_BankCode?: string
  vnp_SecureHash: string
  vnp_BankTranNo: string
  vnp_CardType?: string
  vnp_OrderInfo?: string
  vnp_PayDate?: string
  vnp_ResponseCode?: string
  vnp_TmnCode?: string
  vnp_TransactionNo?: string
  vnp_TransactionStatus?: string
  vnp_TxnRef?: string
}

@Injectable()
export class VnPayService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly appGateway: AppGateway,
    private readonly orderGuestPaymentPaymentHandler: OrderGuestPaymentPaymentHandler,
    private readonly reservationPaymentHandler: ReservationPaymentHandler,
    private readonly ledgerPosting: LedgerPostingService,
  ) {}

  /**
   * Tong tien phai thu cua cac don = tong `grandTotal` (ADR 0001 D6).
   *
   * Khong cong lai tu item: khi co giam gia / phi phuc vu / thue thi tong item khac so tien
   * thuc thu, va khi do so tien VNPay thu se lech voi so tien ghi so.
   */
  async getOrderAmount(orders: OrderResForPaymentType[]): Promise<number> {
    return orders
      .reduce((acc, order: any) => acc.add(new Prisma.Decimal(order.grandTotal ?? 0)), new Prisma.Decimal(0))
      .toDecimalPlaces(2)
      .toNumber()
  }

  async createUrlVnpay({
    amount,
    req,
    processedOrderId,
    orderId,
  }: {
    amount: number
    orderId?: number
    req: Request
    processedOrderId?: string
  }) {
    const processedId = `${processedOrderId}_${moment().format('YYYYMMDDHHmmss')}`

    const date = new Date()
    const createDate = moment(date).format('YYYYMMDDHHmmss')

    const tmnCode = envConfig.VNPAY_TMN_CODE
    const secretKey = envConfig.VNPAY_SECRET_KEY
    const vnpUrl = envConfig.VNPAY_URL
    const returnUrl = envConfig.VNPAY_RETURN_URL

    const ipAddr = this.getClientIp(req)

    const vnp_Params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Amount: new Prisma.Decimal(amount).mul(100).toFixed(0),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: processedId,
      vnp_OrderInfo: `Thanh toán hóa đơn ${processedId}`,
      vnp_OrderType: 'other',
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_Locale: 'vn',
      vnp_CreateDate: createDate,
    }

    const sortedParams = this.sortObject(vnp_Params)
    const signData = qs.stringify(sortedParams, { encode: false })
    const hmac = crypto.createHmac('sha512', secretKey)
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')
    sortedParams['vnp_SecureHash'] = signed

    const paymentUrl = `${vnpUrl}?${qs.stringify(sortedParams, { encode: false })}`

    return paymentUrl
  }

  async createPaymentUrlForGuest({ guestId, req }: { guestId: number; req: Request }): Promise<string> {
    const orders: OrderResForPaymentType[] = toMoneyNumbers(await this.prismaService.order.findMany({
      where: {
        guestId,
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.CONFIRMED,
            OrderStatus.PREPARING,
            OrderStatus.READY,
            OrderStatus.COMPLETED,
          ],
        },
        deletedAt: null,
      },
      include: {
        payment: true,
        items: true,
        guest: true,
      },
    }))

    if (orders.length === 0) {
      throw new NotFoundException('Không tìm thấy đơn hàng nào để thanh toán')
    }

    const amount = await this.getOrderAmount(orders)
    const processedOrderId = generateForVnp_TxnRef({
      type: TypeToOrderStatus.AT_TABLE,
      userId: guestId,
    })

    // Moi lan bam "thanh toan" se tao 1 intent moi; intent cu con PENDING ma trung don thi vo hieu hoa,
    // de URL cu khong the thu tien cho mot hoa don da thay doi.
    await this.prismaService.paymentIntent.updateMany({
      where: { provider: 'vnpay', status: 'PENDING', orderIds: { hasSome: orders.map((order) => order.id) } },
      data: { status: 'VOID', consumedAt: new Date() },
    })

    // Chot so tien + danh sach don de webhook doi chieu ve sau (ADR 0001 D7)
    await this.prismaService.paymentIntent.create({
      data: {
        provider: 'vnpay',
        reference: processedOrderId,
        amount: new Prisma.Decimal(amount),
        orderIds: orders.map((order) => order.id),
        payload: { type: TypeToOrderStatus.AT_TABLE, guestId },
      },
    })

    const url = await this.createUrlVnpay({
      amount,
      req,
      processedOrderId,
    })
    return url
  }
  async handleVnPayReturn(query: VnPayReturnType, res: Response): Promise<void> {
    try {
      console.log('VNPay Return Query:', query)

      if (!query['vnp_TxnRef'] || !query['vnp_ResponseCode']) {
        console.error('Missing required VNPay fields')
        res.redirect(`${envConfig.FRONTEND_URL}/payment-error?error=missing_fields`)
        return
      }

      const checkVerify = this.verifyPayment(query)
      if (!checkVerify) {
        res.redirect(`${envConfig.FRONTEND_URL}/payment-error?error=invalid_signature`)
        return // Thêm return để ngắt luồng
      }

      const vnp_TxnRef = query['vnp_TxnRef']
      const prefixToOrder: prefixToOrderStatusType = vnp_TxnRef.split('_')[0] as prefixToOrderStatusType
      const rspCode = query['vnp_ResponseCode']
      const amount = query['vnp_Amount']
      const vnp_BankCode = query['vnp_BankCode']

      // 1. Lấy thông tin User/Guest ID
      let where: any
      const idPart = vnp_TxnRef.split('_')[1]
      const targetId = Number(idPart)

      if (isNaN(targetId)) {
        console.error('Invalid ID in vnp_TxnRef:', idPart)
        res.redirect(`${envConfig.FRONTEND_URL}/payment-error?error=invalid_id_in_txnref`)
        return
      }

      if (prefixToOrder === prefixToOrderStatus.AT_TABLE) {
        where = { guestId: targetId, deletedAt: null }
      } else if (prefixToOrder === prefixToOrderStatus.ONLINE || prefixToOrder === prefixToOrderStatus.RESERVATION) {
        where = { userId: targetId, deletedAt: null }
      }

      // Chot lai so tien phai thu + danh sach don ngay luc tao URL (PaymentIntent).
      // Khong tinh lai tu gio hang dang thay doi: don tao/huy giua chung se lam sai phep doi chieu.
      const intent = await this.prismaService.paymentIntent.findUnique({ where: { reference: vnp_TxnRef } })

      const orders = (await this.prismaService.order.findMany({
        where: {
          ...where,
          ...(intent && intent.orderIds.length > 0 ? { id: { in: intent.orderIds } } : {}),
          status: {
            in: [
              OrderStatus.COMPLETED,
              OrderStatus.CONFIRMED,
              OrderStatus.PENDING,
              OrderStatus.PREPARING,
              OrderStatus.READY,
            ],
          },
        },
        include: {
          payment: true,
          guest: { select: { name: true } },
          user: { select: { name: true } },
          tableNode: {
            select: { name: true, id: true },
          },
          reservation: true,
        },
      })) as any[]
      console.log('orders', orders)

      if (orders.length === 0) {
        console.error('No pending orders found for ID:', targetId)
        // Dù không tìm thấy đơn, vẫn có thể là thanh toán đã bị xử lý (ví dụ: qua IPN)
        // Nên redirect về trang success/error cơ bản nếu không tìm thấy đơn đang chờ xử lý.
        res.redirect(`${envConfig.FRONTEND_URL}/payment-error?error=no_pending_orders_found`)
        return
      }

      // 2. Chọn Handler (Strategy)
      let handler: PostPaymentHandler
      switch (prefixToOrder) {
        case prefixToOrderStatus.AT_TABLE:
          handler = this.orderGuestPaymentPaymentHandler
          break
        case prefixToOrderStatus.RESERVATION:
          handler = this.reservationPaymentHandler
          break
        case prefixToOrderStatus.ONLINE:
        default:
          // handler = this.onlinePaymentHandler
          break
      }

      let paymentStatus: PaymentStatusType
      let orderStatus: OrderStatusType

      if (rspCode === '00') {
        // --- THANH TOÁN THÀNH CÔNG ---
        // Doi chieu so tien VNPay bao voi so tien phai thu cua chinh cac don nay (ADR 0001 D7)
        const expectedAmount = intent
          ? new Prisma.Decimal(intent.amount)
          : new Prisma.Decimal(await this.getOrderAmount(orders as any))
        if (!isPaymentAmountMatched(expectedAmount.toDecimalPlaces(2), amount)) {
          console.error('[vnpay] amount mismatch on return', {
            vnp_TxnRef,
            vnp_Amount: amount,
            expectedAmount,
            orderIds: orders.map((order) => order.id),
          })
          res.redirect(`${envConfig.FRONTEND_URL}/payment-error?error=amount_mismatch`)
          return
        }

        // Intent phải còn hiệu lực và phải khớp ĐỦ danh sách đơn đã chốt lúc tạo URL.
        // (Nếu 1 đơn trong lô bị huỷ giữa chừng, thu đủ tiền mà chỉ ghi nhận phần còn lại là sai.)
        if (intent) {
          if (!isIntentUsable(intent)) {
            console.error('[vnpay] intent khong con hieu luc', { vnp_TxnRef, status: intent.status })
            res.redirect(`${envConfig.FRONTEND_URL}/payment-error?error=intent_expired`)
            return
          }
          if (orders.length !== intent.orderIds.length) {
            console.error('[vnpay] so don khong khop intent', {
              vnp_TxnRef,
              pinned: intent.orderIds.length,
              matched: orders.length,
            })
            res.redirect(`${envConfig.FRONTEND_URL}/payment-error?error=orders_changed`)
            return
          }
        }

        paymentStatus = PaymentStatus.SUCCESS
        // Logic: RESERVATION chỉ CONFIRMED (đặt cọc), TAB/ONL là PAID (thanh toán đủ)
        orderStatus = prefixToOrder === prefixToOrderStatus.RESERVATION ? OrderStatus.CONFIRMED : OrderStatus.PAID

        const successData = await this.prismaService.$transaction(async (tx) => {
          // 2a0. Idempotency: cung 1 vnp_TxnRef chi duoc tao hieu ung 1 lan (goi lai return/IPN 5 lan)
          const isFirst = await recordWebhookOnce(tx as any, {
            provider: 'vnpay',
            externalId: vnp_TxnRef,
            payload: query as unknown as Prisma.InputJsonValue,
          })
          if (!isFirst) {
            console.warn('[vnpay] replay webhook, bo qua ghi nhan', vnp_TxnRef)
            return {
              applied: false,
              guestName: orders[0]?.guest?.name || orders[0]?.user?.name || 'Khách hàng',
              tableName: orders[0]?.tableNode?.name || 'Chưa gán bàn',
              amount: Number(amount) / 100,
              status: 'success',
              message: 'Giao dịch đã được ghi nhận trước đó',
              bankCode: vnp_BankCode || 'VNPAY',
              prefix: prefixToOrder,
            }
          }

          if (intent) {
            // Claim nguyen tu: chi 1 transaction doi duoc PENDING -> PROCESSED.
            // Neu mot request khac vua VOID/PROCESSED intent thi count = 0 -> rollback.
            const claimed = await tx.paymentIntent.updateMany({
              where: { reference: vnp_TxnRef, status: 'PENDING' },
              data: { status: 'PROCESSED', consumedAt: new Date() },
            })
            if (claimed.count !== 1) {
              throw new BadRequestException('Payment intent đã được xử lý hoặc đã hết hiệu lực')
            }
          }

          // 2a. Cập nhật trạng thái CHUNG (Payment & Order)
          await tx.payment.updateMany({
            where: { id: { in: orders.map((order) => order.paymentId) } },
            data: {
              status: paymentStatus,
              method: PaymentMethod.VNPAY,
              gatewayCode: vnp_BankCode ?? null,
              transactionId: vnp_TxnRef,
              paidAt: new Date(),
              currency: 'VND',
              gatewayPayload: query as unknown as Prisma.InputJsonValue,
            },
          })

          await tx.order.updateMany({
            where: { id: { in: orders.map((order) => order.id) } },
            data: { status: orderStatus },
          })

          // 2a1. Ghi sổ kép trong cùng transaction (ADR 0001 D2)
          await this.postLedgerForCharge(tx as any, {
            vnpTxnRef: vnp_TxnRef,
            prefix: prefixToOrder,
            orders: orders as any[],
          })

          // 2b. Gọi Logic Nghiệp vụ RIÊNG (Strategy)
          await handler.handleSuccess({
            orders: orders,
            vnpTxnRef: vnp_TxnRef,
            vnpBankCode: vnp_BankCode,
            amount: Number(amount),
            tx: tx as any, // Truyền transaction client cho handler
          })

          // Dữ liệu để redirect
          return {
            applied: true,
            guestName: orders[0]?.guest?.name || orders[0]?.user?.name || 'Khách hàng',
            tableName: orders[0]?.tableNode?.name || 'Chưa gán bàn',
            amount: Number(amount) / 100,
            status: 'success',
            message: 'Thanh toán thành công',
            bankCode: vnp_BankCode || 'VNPAY',
            prefix: prefixToOrder,
          }
        })

        console.log('Success Data:', successData)
        // Chi bao cho quay khi giao dich thuc su duoc ghi nhan lan dau (replay khong ban lai)
        const { applied, ...redirectData } = successData as any
        if (applied) {
          this.appGateway.server.to(ManagerRoom).emit(WS_EVENTS.PAYMENT_SUCCESS, redirectData)
        }

        const redirectUrl = `${envConfig.FRONTEND_URL}/payment-success?${qs.stringify(redirectData)}`
        res.redirect(redirectUrl)
      } else {
        // --- THANH TOÁN THẤT BẠI ---
        paymentStatus = PaymentStatus.FAILED
        // Giữ trạng thái Order cũ nếu thanh toán thất bại (ví dụ: PENDING)

        // URL cu (intent da bi VOID/qua han) that bai thi KHONG duoc ha Payment hay huy reservation:
        // khach con 1 URL moi dang song cho chinh don do.
        if (intent && !isIntentUsable(intent)) {
          console.warn('[vnpay] bo qua webhook that bai cua intent khong con hieu luc', {
            vnp_TxnRef,
            status: intent.status,
          })
          const staleData = {
            amount: Number(amount) / 100,
            status: 'failed',
            message: 'Giao dịch không còn hiệu lực',
            errorCode: rspCode,
          }
          res.redirect(`${envConfig.FRONTEND_URL}/payment-failed?${qs.stringify(staleData)}`)
          return
        }

        await this.prismaService.$transaction(async (tx) => {
          // 2a0. Idempotency: 1 lan thu tien that bai chi duoc ghi nhan 1 lan
          const isFirst = await recordWebhookOnce(tx as any, {
            provider: 'vnpay',
            externalId: `${vnp_TxnRef}:FAILED`,
            payload: query as unknown as Prisma.InputJsonValue,
          })
          if (!isFirst) {
            console.warn('[vnpay] replay webhook that bai, bo qua ghi nhan', vnp_TxnRef)
            return
          }

          // 2a. Cập nhật trạng thái Payment THẤT BẠI — chi tu PENDING, khong keo SUCCESS/REFUNDED xuong FAILED
          await tx.payment.updateMany({
            where: { id: { in: orders.map((order) => order.paymentId) }, status: PaymentStatus.PENDING },
            data: {
              status: paymentStatus,
              transactionId: vnp_TxnRef,
            },
          })

          // 2b. Gọi Logic Nghiệp vụ RIÊNG (Strategy)
          await handler.handleFailure({
            orders: orders,
            vnpTxnRef: vnp_TxnRef,
            tx: tx as any, // Truyền transaction client cho handler
          })
          // Lưu ý: Logic thất bại thường là hủy Order nếu là Đặt cọc (RESERVATION)
        })

        // Redirect về frontend với thông tin thất bại
        const errorData = {
          amount: Number(amount) / 100,
          status: 'failed',
          message: 'Thanh toán thất bại',
          errorCode: rspCode,
        }

        const redirectUrl = `${envConfig.FRONTEND_URL}/payment-failed?${qs.stringify(errorData)}`
        console.log('Error Redirect URL:', redirectUrl)
        res.redirect(redirectUrl)
      }
    } catch (error) {
      console.error('Error in handleVnPayReturn:', error)
      res.redirect(`${envConfig.FRONTEND_URL}/payment-error?error=server_error`)
    }
  }

  // ... (các hàm khác như handleVnPayIpn, queryTransaction, verifyPayment, getClientIp, sortObject giữ nguyên)
  /**
   * Ghi sổ cho 1 lần thu tiền VNPay.
   *
   * - Đơn tại bàn: mỗi đơn 1 bút toán (Nợ VNPAY_CLEARING, Có doanh thu/phí/thuế)
   * - Đặt cọc: 1 bút toán cọc (Nợ VNPAY_CLEARING, Có DEPOSIT_LIABILITY — KHÔNG phải doanh thu)
   *
   * eventKey theo `vnp_TxnRef` + payment nên IPN/return gọi lặp cũng chỉ ghi 1 lần.
   */
  private async postLedgerForCharge(
    tx: any,
    input: { vnpTxnRef: string; prefix: string; orders: any[] },
  ): Promise<void> {
    for (const order of input.orders) {
      const isDeposit = input.prefix === prefixToOrderStatus.RESERVATION
      const amount = new Prisma.Decimal(order.payment?.amount ?? 0).toDecimalPlaces(2)
      if (amount.lessThanOrEqualTo(0)) continue

      const lines = isDeposit
        ? [
            { accountCode: 'VNPAY_CLEARING', direction: 'DEBIT' as const, amount },
            { accountCode: 'DEPOSIT_LIABILITY', direction: 'CREDIT' as const, amount },
          ]
        : buildOrderLedgerLines(
            {
              grandTotal: order.grandTotal,
              subtotal: order.subtotal,
              discountTotal: order.discountTotal,
              serviceChargeAmount: order.serviceChargeAmount,
              taxTotal: order.taxTotal,
            },
            'VNPAY_CLEARING',
          )
      if (lines.length === 0) continue

      await this.ledgerPosting.postEntry(
        {
          branchId: order.branchId,
          refType: isDeposit ? 'RESERVATION_DEPOSIT' : 'ORDER_PAID_VNPAY',
          refId: order.paymentId,
          idempotencyKey: `vnpay:${input.vnpTxnRef}:${order.paymentId}`,
          memo: isDeposit ? `Cọc VNPay reservation #${order.reservationId}` : `Thu VNPay đơn #${order.id}`,
          lines: lines.map((line) => ({ ...line, orderId: order.id, paymentId: order.paymentId })),
        },
        tx,
      )
    }
  }

  async handleVnPayIpn(query: any, res: Response): Promise<void> {
    const checkVerify = this.verifyPayment(query)

    if (checkVerify) {
      const guestId: string = query['vnp_TxnRef'].split('_')[1]
      const prefix: string = query['vnp_TxnRef'].split('_')[0]
      const rspCode = query['vnp_ResponseCode']
      const vnp_TxnRef = query['vnp_TxnRef']
      const amount = query['vnp_Amount']
      const vnp_Status = query['vnp_TransactionStatus']
      const vnp_PayDate = query['vnp_PayDate']

      let handler: PostPaymentHandler
      if (prefix == prefixToOrderStatus.AT_TABLE) {
        handler = this.orderGuestPaymentPaymentHandler
      } else if (prefix == prefixToOrderStatus.RESERVATION) {
        handler = this.reservationPaymentHandler
      } else {
        // handler = this.onlinePaymentHandler
      }

      const intent = await this.prismaService.paymentIntent.findUnique({ where: { reference: vnp_TxnRef } })

      const orders = await this.prismaService.order.findMany({
        where: {
          ...(prefix === prefixToOrderStatus.RESERVATION || prefix === prefixToOrderStatus.ONLINE
            ? { userId: parseInt(guestId) }
            : { guestId: parseInt(guestId) }),
          deletedAt: null,
          ...(intent && intent.orderIds.length > 0 ? { id: { in: intent.orderIds } } : {}),
        },
        include: { payment: true },
      })

      if (orders.length === 0) {
        res.status(404).send('Order not found')
        return
      }

      if (rspCode === '00') {
        if (intent) {
          if (!isIntentUsable(intent)) {
            console.error('[vnpay] intent khong con hieu luc (ipn)', { vnp_TxnRef, status: intent.status })
            res.status(400).send('Intent expired')
            return
          }
          if (orders.length !== intent.orderIds.length) {
            console.error('[vnpay] so don khong khop intent (ipn)', {
              vnp_TxnRef,
              pinned: intent.orderIds.length,
              matched: orders.length,
            })
            res.status(400).send('Orders changed')
            return
          }
        }

        const expectedAmount = intent
          ? new Prisma.Decimal(intent.amount)
          : new Prisma.Decimal(await this.getOrderAmount(orders as any))
        if (!isPaymentAmountMatched(expectedAmount.toDecimalPlaces(2), amount)) {
          console.error('[vnpay] amount mismatch on ipn', {
            vnp_TxnRef,
            vnp_Amount: amount,
            expectedAmount,
            orderIds: orders.map((order) => order.id),
          })
          // VNPay se retry IPN; tra loi ro rang de ben kia thay day la loi du lieu
          res.status(400).send('Amount mismatch')
          return
        }

        await this.prismaService.$transaction(async (tx) => {
          const isFirst = await recordWebhookOnce(tx as any, {
            provider: 'vnpay',
            externalId: vnp_TxnRef,
            payload: query as unknown as Prisma.InputJsonValue,
          })
          if (!isFirst) {
            console.warn('[vnpay] replay ipn, bo qua ghi nhan', vnp_TxnRef)
            return
          }

          if (intent) {
            const claimed = await tx.paymentIntent.updateMany({
              where: { reference: vnp_TxnRef, status: 'PENDING' },
              data: { status: 'PROCESSED', consumedAt: new Date() },
            })
            if (claimed.count !== 1) {
              throw new BadRequestException('Payment intent đã được xử lý hoặc đã hết hiệu lực')
            }
          }

          await tx.payment.updateMany({
            where: {
              id: {
                in: orders.map((order) => order.paymentId),
              },
            },
            data: {
              status: PaymentStatus.SUCCESS,
              method: PaymentMethod.VNPAY,
              transactionId: vnp_TxnRef,
              paidAt: new Date(),
              currency: 'VND',
              gatewayPayload: query as unknown as Prisma.InputJsonValue,
            },
          })

          await tx.order.updateMany({
            where: {
              id: {
                in: orders.map((order) => order.id),
              },
            },
            data: { status: OrderStatus.PAID },
          })

          await this.postLedgerForCharge(tx as any, {
            vnpTxnRef: vnp_TxnRef,
            prefix,
            orders: orders as any[],
          })

          await handler.handleSuccess({
            orders: orders as any, // IPN thường là thanh toán đủ nên status là PAID
            vnpTxnRef: vnp_TxnRef,
            vnpBankCode: '', // VNPAY IPN không phải lúc nào cũng có
            amount: Number(amount),
            tx: tx as any,
          })
        })

        res.status(200).send('OK')
      } else {
        // That bai qua IPN: cung phai idempotent + chi ha cap payment dang PENDING
        if (intent && !isIntentUsable(intent)) {
          console.warn('[vnpay] bo qua ipn that bai cua intent khong con hieu luc', {
            vnp_TxnRef,
            status: intent.status,
          })
          res.status(200).send('OK')
          return
        }

        await this.prismaService.$transaction(async (tx) => {
          const isFirst = await recordWebhookOnce(tx as any, {
            provider: 'vnpay',
            externalId: `${vnp_TxnRef}:FAILED`,
            payload: query as unknown as Prisma.InputJsonValue,
          })
          if (!isFirst) return

          await tx.payment.updateMany({
            where: { id: { in: orders.map((order) => order.paymentId) }, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.FAILED, transactionId: vnp_TxnRef },
          })

          await handler.handleFailure({
            orders: orders as any,
            vnpTxnRef: vnp_TxnRef,
            tx: tx as any,
          })
        })

        res.status(200).send('OK')
      }
    } else {
      res.status(400).send('Invalid signature')
    }
  }

  async queryTransaction(orderId: string, transDate: string): Promise<any> {
    const vnp_TxnRef = orderId
    const vnp_TransactionDate = moment(transDate).format('YYYYMMDDHHmmss')
    const vnp_TmnCode = envConfig.VNPAY_TMN_CODE
    const secretKey = envConfig.VNPAY_SECRET_KEY
    const vnp_Api = envConfig.VNPAY_API_URL
    const vnp_RequestId = moment(new Date()).format('HHmmss')
    const vnp_Version = '2.1.0'
    const vnp_Command = 'querydr'
    const vnp_OrderInfo = 'Truy van GD ma:' + vnp_TxnRef
    const vnp_CreateDate = moment(new Date()).format('YYYYMMDDHHmmss')

    const obj = {
      vnp_RequestId,
      vnp_Version,
      vnp_Command,
      vnp_TmnCode,
      vnp_TxnRef,
      vnp_TransactionDate,
      vnp_OrderInfo,
      vnp_CreateDate,
    }

    const objSort = this.sortObject(obj)
    const signData = qs.stringify(objSort, { encode: false })
    const hmac = crypto.createHmac('sha512', secretKey)
    const vnp_SecureHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')

    const dataObj = {
      ...objSort,
      vnp_SecureHash,
    }

    try {
      const response = await axios.post(vnp_Api, dataObj, {
        headers: { 'Content-Type': 'application/json' },
      })
      return response.data
    } catch (error) {
      throw new HttpException(`VNPay API Error: ${error.message}`, HttpStatus.BAD_REQUEST)
    }
  }

  private verifyPayment(query: any): boolean {
    try {
      const vnp_Params = { ...query }
      const secureHash = vnp_Params['vnp_SecureHash']

      delete vnp_Params['vnp_SecureHash']
      delete vnp_Params['vnp_SecureHashType']

      const sortedParams = this.sortObject(vnp_Params)
      const secretKey = envConfig.VNPAY_SECRET_KEY

      const signData = qs.stringify(sortedParams, { encode: false })
      const hmac = crypto.createHmac('sha512', secretKey)
      const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')

      return secureHash === signed
    } catch (error) {
      console.error('Error verifying payment:', error)
      return false
    }
  }

  private processOrderId(orderId: string): string {
    const random = Math.floor(Math.random() * 100)
    return `${orderId}_${random}`
  }

  private getClientIp(req: Request): string {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || ''

    if (ip && typeof ip === 'string' && ip.includes(',')) {
      return ip.split(',')[0].trim()
    }

    return ip as string
  }

  private sortObject(obj: any): any {
    const sorted: any = {}
    const str: string[] = []
    let key: string

    for (key in obj) {
      if (obj.hasOwnProperty(key)) {
        str.push(encodeURIComponent(key))
      }
    }

    str.sort()

    str.forEach((key) => {
      sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+')
    })

    return sorted
  }
}
