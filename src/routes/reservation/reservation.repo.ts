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

@Injectable()
export class ReservationRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sharedOrderRepo: SharedOrdersRepo,
    private readonly vnpayService: VnPayService,
    private readonly sharedTableNodeRepo: SharedTableNodeRepo,
  ) {}

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

      const skusPriceMap = new Map<number, number>(skus.map((item) => [item.id, item.price]))

      const missingSkus = preOrderItems.filter((item) => !skusPriceMap.has(item.skuId))
      if (missingSkus.length > 0) {
        throw new Error(`SKU not found: ${missingSkus.map((item) => item.skuId).join(', ')}`)
      }

      const totalSku = preOrderItems.reduce((sum, item) => {
        const price = skusPriceMap.get(item.skuId) || 0
        return sum + price * item.quantity
      }, 0)

      return {
        totalSku,
        skus,
      }
    } catch (error) {
      console.error('Error in calculatePreOrderTotal:', error)
      throw error
    }
  }
  private async calculateDepositAmount(preOrderTotal: number, depositPercent: number): Promise<number> {
    if (![30, 50, 70, 100].includes(depositPercent)) {
      throw new Error('Deposit percent must be 30, 50, 70, or 100')
    }

    const depositAmount = Math.round((preOrderTotal * depositPercent) / 100)
    return depositAmount
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
      depositAmount,
      reservationTime,
      customerName,
      note,
    } = body
    // if (!hasPreOrder && (depositAmount || depositPercent)) {
    //   throw new BadRequestException(
    //     'Không hợp lệ: không có preorder nhưng lại truyền depositAmount hoặc depositPercent.',
    //   )
    // }

    try {
      let preOrderTotal = 0
      await this.ValidateTable(tableNodeId)
      if (hasPreOrder && preOrderItems.length > 0) {
        console.log('hasPreOrder', hasPreOrder)

        const calculation = await this.calculatePreOrderTotal(preOrderItems)
        if (!calculation) {
          throw new Error('Error')
        }
        const expectedDeposit = await this.calculateDepositAmount(calculation.totalSku, depositPercent!)

        if (Math.abs(expectedDeposit - depositAmount!) > 1000) {
          throw new Error('Deposit amount mismatch')
        }
        preOrderTotal = calculation.totalSku
        const result = await this.prismaService.$transaction(async (tx) => {
          const newReservation = await tx.reservation.create({
            data: {
              customerPhone,
              customerName,
              guestCount,
              depositAmount,
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
            depositAmount: depositAmount || 0,
            tx,
          })

          const processedOrderId = generateForVnp_TxnRef({
            type: TypeToOrderStatus.RESERVATION,
            userId,
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
      const [newReservation] = await Promise.all([
        this.prismaService.reservation.create({
          data: {
            customerPhone,
            customerName,
            guestCount,
            depositAmount,
            depositPercent,
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
      data,
      total,
      page,
      limit,
    }
  }
}
