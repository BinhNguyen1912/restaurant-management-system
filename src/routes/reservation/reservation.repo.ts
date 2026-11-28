import { toMoneyNumbers } from '@/shared/service/money-serializer'
import { computeDepositAmount, isAllowedDepositPercent } from '@/shared/service/deposit-policy'
import { resolveBranchIdByTableNode } from '@/shared/service/branch.resolver'
import { PrismaService } from '@/shared/service/prisma.service'
import { BadRequestException, Injectable } from '@nestjs/common'
import {
  ReservationBaseQueryType,
  ReservationBodyType,
  ReservationIncludeUrlVnpayType,
  ReservationQueryType,
} from './reservation.model'
import { SharedOrdersRepo } from '@/shared/shared-repository/shared-orders.repo'
import { CreateNewOrderType } from '@/shared/models/shared-order.model'
import { reservationStatus, reservationStatusType } from '@/shared/constants/reservation.constant'
import { VnPayService } from '@/shared/service/vnpay.service'
import { Request } from 'express'
import { ReservationType } from '@/shared/models/shared-reservation.model'
import { generateForVnp_TxnRef } from '@/shared/helper'
import { TypeToOrderStatus } from '@/shared/constants/order.constant'
import { Prisma } from '@prisma/client'
import { SharedTableNodeRepo } from '@/shared/shared-repository/shared-tableNode.repo'
import { TableNodeNotFoundException } from './reservation.error'
import { CustomerRepo } from '@/routes/customer/customer.repo'
import { normalizeCustomerPhone } from '@/routes/customer/customer.identity'
import { CONSENT_POLICY_VERSION, currentConsents } from '@/routes/customer/customer.consent-policy'

@Injectable()
export class ReservationRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sharedOrderRepo: SharedOrdersRepo,
    private readonly vnpayService: VnPayService,
    private readonly sharedTableNodeRepo: SharedTableNodeRepo,
    private readonly customerRepo: CustomerRepo,
  ) {}

  /**
   * Hồ sơ khách của lượt đặt bàn — tạo/gộp ngay trong transaction của caller.
   *
   * SĐT không chuẩn hoá được (khách gõ "0901", "abc") thì trả `null` chứ không ném lỗi: mất một
   * hồ sơ CRM là thiếu số liệu, còn chặn luồng đặt bàn vì ô SĐT gõ xấu là hỏng việc kinh doanh.
   */
  private async resolveCustomerId(
    tx: Prisma.TransactionClient | PrismaService,
    input: { phone: string; name: string; userId: number; marketingConsent?: boolean },
  ): Promise<number | null> {
    const phone = normalizeCustomerPhone(input.phone)
    if (!phone) return null
    const customerId = await this.customerRepo.upsertProfile(tx, { phone, name: input.name, userId: input.userId })
    await this.recordMarketingConsent(tx, customerId, input.marketingConsent, input.userId)
    return customerId
  }

  /**
   * Ghi nhận đồng ý nhận ưu đãi ngay lúc thu SĐT (NĐ 13/2023: đồng ý theo từng mục đích).
   *
   * Chỉ ghi khi khách ĐÃ ĐƯỢC HỎI (`marketingConsent !== undefined`) và câu trả lời KHÁC lần trước —
   * không tự ghi "đồng ý" thay khách, và không sinh một dòng mỗi lần đặt bàn.
   */
  private async recordMarketingConsent(
    tx: Prisma.TransactionClient | PrismaService,
    customerId: number,
    marketingConsent: boolean | undefined,
    actorId: number,
  ): Promise<void> {
    if (marketingConsent === undefined) return
    const current = currentConsents(await this.customerRepo.consents(customerId, tx)).find(
      (state) => state.purpose === 'MARKETING',
    )
    if (current && current.granted === marketingConsent && !current.stale) return
    await this.customerRepo.appendConsent(
      {
        customerId,
        purpose: 'MARKETING',
        version: CONSENT_POLICY_VERSION,
        granted: marketingConsent,
        note: 'Ghi nhận khi đặt bàn',
        createdById: actorId,
      },
      tx,
    )
  }

  private async calculatePreOrderTotal(preOrderItems: CreateNewOrderType): Promise<{
    totalSku: number
    skus: {
      id: number
      price: number
      product: {
        name: string
      }
    }[]
  } | null> {
    if (!preOrderItems || preOrderItems.length === 0) {
      return null
    }
    try {
      const skuIds = preOrderItems.map((item) => item.skuId)
      const skus = await this.prismaService.sKU.findMany({
        where: {
          id: {
            in: skuIds,
          },
        },
        select: {
          id: true,
          price: true,
          product: {
            select: {
              name: true,
            },
          },
        },
      })

      // Gia SKU la Decimal: giu Decimal khi tinh tien coc de khong sai so lam tron
      const skusPriceMap = new Map<number, Prisma.Decimal>(skus.map((item) => [item.id, new Prisma.Decimal(item.price)]))

      const missingSkus = preOrderItems.filter((item) => !skusPriceMap.has(item.skuId))
      if (missingSkus.length > 0) {
        throw new Error(`SKU not found: ${missingSkus.map((item) => item.skuId).join(', ')}`)
      }

      const totalSku = preOrderItems
        .reduce(
          (sum, item) => sum.add((skusPriceMap.get(item.skuId) ?? new Prisma.Decimal(0)).mul(item.quantity)),
          new Prisma.Decimal(0),
        )
        .toDecimalPlaces(2)
        .toNumber()

      return {
        totalSku,
        skus: toMoneyNumbers(skus),
      }
    } catch (error) {
      console.error('Error in calculatePreOrderTotal:', error)
      throw error
    }
  }
  async ValidateTable(tableNodeId: number) {
    const table = await this.sharedTableNodeRepo.GetTableNodeById(tableNodeId)
    if (!table) {
      throw TableNodeNotFoundException
    }
    if (table.status == 'RESERVED') {
      throw new BadRequestException(`Bàn ${table.name} đã được đặt trước. Vui lòng chọn bàn khác`)
    }
    if (table.status == 'HIDE' || table.status == 'OUT_OF_SERVICE') {
      throw new BadRequestException(`Bàn ${table.name} đã bị ẩn hoặc đang sửa chữa. Vui lòng chọn bàn khác`)
    }
    if (table.status == 'OCCUPIED') {
      throw new BadRequestException(`Bàn ${table.name} đang có khách. Vui lòng chọn bàn khác`)
    }
    return table
  }

  async createNewReservation({
    body,
    userId,
    req,
  }: {
    body: ReservationBodyType
    userId: number
    req: Request
  }): Promise<ReservationIncludeUrlVnpayType | ReservationType> {
    const {
      hasPreOrder,
      customerPhone,
      guestCount,
      preOrderItems,
      tableNodeId,
      depositPercent,
      reservationTime,
      customerName,
      note,
      marketingConsent,
    } = body

    try {
      let preOrderTotal = 0
      await this.ValidateTable(tableNodeId)
      if (hasPreOrder && preOrderItems.length > 0) {
        console.log('hasPreOrder', hasPreOrder)

        const calculation = await this.calculatePreOrderTotal(preOrderItems)
        if (!calculation) {
          throw new Error('Error')
        }
        // Mức cọc lạ (ví dụ 40%) không được zod chặn, nên phải chặn ở đây: computeDepositAmount
        // ném lỗi thường và biến thành 500 thay vì 400.
        if (!isAllowedDepositPercent(depositPercent)) {
          throw new BadRequestException(`Mức cọc phải là 30, 50, 70 hoặc 100%, nhận ${depositPercent ?? 0}%`)
        }
        // Tiền cọc server luôn tự tính từ %cọc × giá trị món đặt trước. Client không gửi số tiền cọc,
        // nên Payment.amount, số VNPay thu và bút toán quyết toán cọc luôn là cùng một số.
        const expectedDeposit = computeDepositAmount(calculation.totalSku, depositPercent!)
        preOrderTotal = calculation.totalSku
        const result = await this.prismaService.$transaction(async (tx) => {
          // Reservation gan voi 1 ban cu the -> chi nhanh lay tu ban (ADR 0001 D4)
          const branchId = await resolveBranchIdByTableNode(tx as any, tableNodeId)
          // Hồ sơ khách tạo TRƯỚC lượt đặt bàn, trong cùng transaction: không có khách mồ côi và
          // reservation luôn trỏ được tới người đã đặt.
          const customerId = await this.resolveCustomerId(tx, {
            phone: customerPhone,
            name: customerName,
            userId,
            marketingConsent,
          })
          const newReservation = await tx.reservation.create({
            data: {
              branchId,
              customerPhone,
              customerName,
              customerId,
              guestCount,
              depositAmount: expectedDeposit,
              depositPercent,
              createdById: userId,
              userId,
              tableNodeId,
              note,
              hasPreOrder,
              status: reservationStatus.PENDING,
              reservationTime: new Date(reservationTime),
            },
          })

          const order = await this.sharedOrderRepo.CreateOrdersForUser({
            orderItems: preOrderItems,
            tableNodeId,
            reservationId: newReservation.id,
            userId,
            createdById: userId,
            depositAmount: expectedDeposit,
            tx,
          })

          const processedOrderId = generateForVnp_TxnRef({
            type: TypeToOrderStatus.RESERVATION,
            userId,
          })
          // Vo hieu hoa intent cu con treo cua chinh don nay, roi chot so tien coc phai thu
          await tx.paymentIntent.updateMany({
            where: {
              provider: 'vnpay',
              status: 'PENDING',
              orderIds: { hasSome: order?.id ? [order.id] : [] },
            },
            data: { status: 'VOID', consumedAt: new Date() },
          })
          await tx.paymentIntent.create({
            data: {
              provider: 'vnpay',
              reference: processedOrderId,
              amount: new Prisma.Decimal(expectedDeposit),
              orderIds: order?.id ? [order.id] : [],
              payload: { type: TypeToOrderStatus.RESERVATION, userId, reservationId: newReservation.id },
            },
          })
          const urlVnPay = await this.vnpayService.createUrlVnpay({
            amount: expectedDeposit,
            req,
            processedOrderId: processedOrderId,
          })

          return {
            reservation: newReservation,
            urlVnPay: urlVnPay,
          }
        })
        return result
      }
      // Nhánh không đặt trước: hồ sơ khách gộp trước khi tạo lượt đặt bàn (không transaction vì
      // luồng này vốn đã tách rời; hồ sơ thừa không mang số liệu, chỉ thừa một dòng trống).
      const customerId = await this.resolveCustomerId(this.prismaService, {
        phone: customerPhone,
        name: customerName,
        userId,
        marketingConsent,
      })
      const [newReservation] = await Promise.all([
        this.prismaService.reservation.create({
          data: {
            branchId: await resolveBranchIdByTableNode(this.prismaService, tableNodeId),
            customerPhone,
            customerName,
            customerId,
            guestCount,
            depositAmount: null,
            depositPercent: null,
            createdById: userId,
            userId,
            tableNodeId,
            note,
            hasPreOrder,
            status: reservationStatus.PENDING,
            reservationTime: new Date(reservationTime),
          },
        }),
        await this.prismaService.tableNode.update({
          where: {
            id: tableNodeId,
            deletedAt: null,
          },
          data: {
            status: 'RESERVED',
          },
        }),
      ])

      return newReservation
    } catch (error) {
      console.log('[ERROR.RESER-REPO]', error)

      throw error
    }
  }

  async list(query: ReservationQueryType, where: Prisma.ReservationWhereInput) {
    const { limit, page, orderBy } = query
    const skip = (page - 1) * limit
    const take = limit
    const [data, total] = await Promise.all([
      this.prismaService.reservation.findMany({
        where,
        skip,
        take,
        include: {
          tableNode: {
            select: {
              area: {
                select: {
                  id: true,
                  name: true,
                },
              },
              name: true,
              status: true,
              seats: true,
            },
          },
          user: {
            select: {
              email: true,
              name: true,
              id: true,
              avatar: true,
            },
          },
          orders: {
            include: {
              items: true,
              products: true,
            },
          },
        },
      }),
      this.prismaService.reservation.count({
        where,
      }),
    ])
    return {
      data: toMoneyNumbers(data),
      total,
      page,
      limit,
    }
  }
}
