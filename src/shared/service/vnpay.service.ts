import { Injectable, HttpException, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import {
  OrderStatus,
  OrderStatusType,
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
import type { Prisma } from '@prisma/client'
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
  ) {}

  async getOrderAmount(orders: OrderResForPaymentType[]): Promise<number> {
    return orders.reduce((acc, order) => {
      const orderTotal = order.items.reduce((itemAcc: number, item: any) => {
        return itemAcc + item.skuPrice * item.quantity
      }, 0)
      return acc + orderTotal
    }, 0)
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
      vnp_Amount: amount * 100,
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
    const orders: OrderResForPaymentType[] = await this.prismaService.order.findMany({
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
    })

    if (orders.length === 0) {
      throw new NotFoundException('Không tìm thấy đơn hàng nào để thanh toán')
    }

    const amount = await this.getOrderAmount(orders)
    const processedOrderId = generateForVnp_TxnRef({
      type: TypeToOrderStatus.AT_TABLE,
      userId: guestId,
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

      const orders = (await this.prismaService.order.findMany({
        where: {
          ...where,
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
        paymentStatus = PaymentStatus.SUCCESS
        // Logic: RESERVATION chỉ CONFIRMED (đặt cọc), TAB/ONL là PAID (thanh toán đủ)
        orderStatus = prefixToOrder === prefixToOrderStatus.RESERVATION ? OrderStatus.CONFIRMED : OrderStatus.PAID

        const successData = await this.prismaService.$transaction(async (tx) => {
          // 2a. Cập nhật trạng thái CHUNG (Payment & Order)
          await tx.payment.updateMany({
            where: { id: { in: orders.map((order) => order.paymentId) } },
            data: {
              status: paymentStatus,
              method: vnp_BankCode || 'VNPAY',
              transactionId: vnp_TxnRef,
            },
          })

          await tx.order.updateMany({
            where: { id: { in: orders.map((order) => order.id) } },
            data: { status: orderStatus },
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
        this.appGateway.server.to(ManagerRoom).emit(WS_EVENTS.PAYMENT_SUCCESS, successData)

        const redirectUrl = `${envConfig.FRONTEND_URL}/payment-success?${qs.stringify(successData)}`
        res.redirect(redirectUrl)
      } else {
        // --- THANH TOÁN THẤT BẠI ---
        paymentStatus = PaymentStatus.FAILED
        // Giữ trạng thái Order cũ nếu thanh toán thất bại (ví dụ: PENDING)

        await this.prismaService.$transaction(async (tx) => {
          // 2a. Cập nhật trạng thái Payment THẤT BẠI
          await tx.payment.updateMany({
            where: { id: { in: orders.map((order) => order.paymentId) } },
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

      const orders = await this.prismaService.order.findMany({
        where: {
          guestId: parseInt(guestId),
          deletedAt: null,
        },
        include: { payment: true },
      })

      if (orders.length === 0) {
        res.status(404).send('Order not found')
        return
      }

      if (rspCode === '00') {
        await this.prismaService.$transaction(async (tx) => {
          await tx.payment.updateMany({
            where: {
              id: {
                in: orders.map((order) => order.paymentId),
              },
            },
            data: {
              status: PaymentStatus.SUCCESS,
              transactionId: vnp_TxnRef,
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
        await this.prismaService.$transaction(async (tx) => {
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
