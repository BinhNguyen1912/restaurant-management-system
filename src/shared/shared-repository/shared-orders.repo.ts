import { toMoneyNumbers } from '@/shared/service/money-serializer'
import { computeOrderMoney } from '@/shared/service/order-money'
import { CACHE_KEYS } from '@/cache/cache.constant'
import { CacheService } from '@/cache/services/cache.service'
import { deduct_stock } from '@/shared/constants/lua.constant'
import { OrderStatus, PaymentStatus, TypeToOrderStatus, TypeToOrderStatusType } from '@/shared/constants/order.constant'
import { Inventory_Queue, ManagerRoom, WS_EVENTS } from '@/shared/constants/others.constant'
import { SkuStatus } from '@/shared/constants/sku.constant'
import { TableStatus, TableStatusType } from '@/shared/constants/table.constant'
import {
  OrderResType,
  CreateNewOrderSchema,
  CreateNewOrderType,
  UpdateOrderResType,
  UpdateOrderType,
} from '@/shared/models/shared-order.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { RedisService } from '@/shared/service/redis.service'
import { AppGateway } from '@/webSockets/app.gateway'
import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException } from '@nestjs/common'
import { Queue } from 'bullmq'
import { TableNodeType } from '../models/shared-tableNode.model'
import { Prisma, PrismaClient } from '@prisma/client'
type PrismaTransaction = Prisma.TransactionClient
export class SharedOrdersRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    @InjectQueue(Inventory_Queue) private readonly inventoryQueue: Queue,
    private readonly appGateway: AppGateway,
  ) {}

  async validateIngredientByLuaBeforeCreateOrder(orderItems: CreateNewOrderType): Promise<{
    errors: any[]
    updated: any[]
    lowStock: any[]
  }> {
    const luaScript = this.redisService.luaScripts.get(deduct_stock.split('.')[0])
    if (!luaScript) {
      throw new Error('Lua script for stock deduction not loaded')
    }
    const checkAndDeductStock = await this.redisService.runLuaScript<{
      errors: any[]
      updated: any[]
      lowStock: any[]
    }>(luaScript, orderItems)

    if (checkAndDeductStock.errors && checkAndDeductStock.errors.length > 0) {
      console.log('checkAndDeductStock.errors', checkAndDeductStock.errors)
      const detailedErrors = await Promise.all(
        checkAndDeductStock.errors.map(async (error) => {
          if (error.NotEnough && error.NotEnough === 'true') {
            const skuId = (error.skuItem as (typeof orderItems)[0]).skuId
            const ingreKey = await CACHE_KEYS.INGREDIENT(skuId)

            try {
              const [skuDetails] = await Promise.all([
                this.prismaService.sKU.findUnique({
                  where: { id: skuId },
                  include: {
                    product: {
                      select: { name: true },
                    },
                  },
                }),
                this.prismaService.sKU.update({
                  where: { id: skuId, deletedAt: null },
                  data: {
                    status: SkuStatus.OUT_OF_STOCK,
                  },
                }),
              ])

              return {
                skuId,
                productName: skuDetails?.product?.name || `Sản phẩm ID: ${skuId}`,
                message: `Không đủ nguyên liệu để chế biến ${skuDetails?.product?.name || `sản phẩm ID ${skuId}`}`,
              }
            } catch (redisError) {
              console.error('Error fetching SKU info from Redis:', redisError)
              return {
                skuId,
                productName: `Sản phẩm ID: ${skuId}`,
                message: `Không đủ nguyên liệu để chế biến sản phẩm ID ${skuId}`,
                ingredientName: 'Thông tin nguyên liệu không khả dụng',
                currentStock: 0,
                requiredQuantity: error.skuItem?.quantity || 0,
              }
            }
          }

          // Xử lý lỗi Recipe not found
          if (error.message === 'Recipe not found') {
            const skuId = Number(error.skuId)
            const skuDetails = await this.prismaService.sKU.findUnique({
              where: { id: skuId },
              include: {
                product: {
                  select: { name: true },
                },
              },
            })

            return {
              skuId,
              productName: skuDetails?.product?.name || `Sản phẩm ID: ${skuId}`,
              message: `Sản phẩm ${skuDetails?.product?.name || `ID ${skuId}`} chưa có định lượng nguyên liệu. Vui lòng liên hệ quản lý để thiết lập công thức.`,
              errorType: 'NO_RECIPE',
            }
          }

          // Xử lý lỗi Ingredient missing
          if (error.message && error.message.includes('Ingredient missing')) {
            const skuId = error.skuId
            const skuDetails = await this.prismaService.sKU.findUnique({
              where: { id: skuId },
              include: {
                product: {
                  select: { name: true },
                },
              },
            })

            return {
              skuId,
              productName: skuDetails?.product?.name || `Sản phẩm ID: ${skuId}`,
              message: `Sản phẩm ${skuDetails?.product?.name || `ID ${skuId}`} có nguyên liệu không tồn tại trong hệ thống.`,
              errorType: 'MISSING_INGREDIENT',
            }
          }

          return {
            skuId: error.skuItem?.skuId || error.skuId || 'Unknown',
            message: error.message || 'Lỗi không xác định',
            ...error,
          }
        }),
      )

      const hasNoRecipe = detailedErrors.some((err) => err.errorType === 'NO_RECIPE')
      const hasMissingIngredient = detailedErrors.some((err) => err.errorType === 'MISSING_INGREDIENT')
      const hasNotEnoughStock = detailedErrors.some((err) => !err.errorType)

      let notificationMessage = 'Cảnh báo: '
      if (hasNoRecipe) {
        notificationMessage += 'Một số sản phẩm chưa có định lượng nguyên liệu'
      }
      if (hasMissingIngredient) {
        notificationMessage += 'Một số sản phẩm có nguyên liệu không tồn tại'
      }
      if (hasNotEnoughStock) {
        notificationMessage += 'Thiếu nguyên liệu để chế biến đơn hàng'
      }

      this.appGateway.server.to(ManagerRoom).emit('Order-Error', {
        message: notificationMessage,
        errors: detailedErrors,
        timestamp: new Date().toISOString(),
      })

      throw new BadRequestException({
        message: 'Không thể tạo đơn hàng do thiếu nguyên liệu',
        errors: detailedErrors,
      })
    }

    if (checkAndDeductStock.lowStock && checkAndDeductStock.lowStock.length > 0) {
      const lowStockDetails = await Promise.all(
        checkAndDeductStock.lowStock.map(async (item) => {
          const ingreKey = await CACHE_KEYS.INGREDIENT(item.ingredientId)
          const ingredientInfo = await this.redisService.getHash(ingreKey)
          return {
            ingredientId: item.ingredientId,
            ingredientName: ingredientInfo?.name || `Nguyên liệu ID: ${item.ingredientId}`,
            currentStock: item.newStock,
            minStock: item.minStock,
            unit: ingredientInfo?.unitId || 'N/A',
          }
        }),
      )

      this.appGateway.server.to(ManagerRoom).emit(WS_EVENTS.LOW_STOCK_WARNING, {
        message: 'Cảnh báo: Một số nguyên liệu đã đạt ngưỡng tối thiểu',
        lowStockItems: lowStockDetails,
        timestamp: new Date().toISOString(),
      })
    }

    return checkAndDeductStock
  }

  private async validateTableBeforeCreateOrder({
    tableNodeId,
    tx,
  }: {
    tableNodeId: number
    tx: PrismaTransaction
  }): Promise<
    TableNodeType & {
      branchId: number
      taxRate: Prisma.Decimal.Value
      serviceChargeRate: Prisma.Decimal.Value
      pricesIncludeTax: boolean
    }
  > {
    const table = await tx.tableNode.findUniqueOrThrow({
      where: {
        id: tableNodeId,
        deletedAt: null,
      },
      include: {
        // Cấu hình thuế/phí của chi nhánh: đơn mới lấy theo đây rồi snapshot vào đơn
        branch: { select: { taxRate: true, serviceChargeRate: true, pricesIncludeTax: true } },
      },
    })

    const unavailableStatuses = [TableStatus.HIDE, TableStatus.OUT_OF_SERVICE]

    if (unavailableStatuses.includes(table.status as any)) {
      throw new BadRequestException(`Bàn ${table.name || table.id} không khả dụng. Vui lòng chọn bàn khác!`)
    }

    if (table.status === TableStatus.RESERVED) {
      throw new BadRequestException(`Bàn ${table.name || table.id} đã được đặt trước. Vui lòng chọn bàn khác!`)
    }

    return {
      ...table,
      taxRate: table.branch.taxRate,
      serviceChargeRate: table.branch.serviceChargeRate,
      pricesIncludeTax: table.branch.pricesIncludeTax,
    }
  }

  private async validateSku({ orderItems, tx }: { orderItems: CreateNewOrderType; tx: PrismaTransaction }) {
    const skuPromises = orderItems.map(async (skuItem) => {
      const sku = await tx.sKU.findUniqueOrThrow({
        where: {
          id: skuItem.skuId,
          deletedAt: null,
        },
        include: {
          product: {
            include: {
              productTranslations: true,
            },
          },
        },
      })

      if (sku.status == SkuStatus.HIDDEN) {
        throw new Error(`Sản phẩm ${sku.product.name} đã bị ẩn. Vui lòng chọn sản phẩm khác`)
      }

      if (sku.status == SkuStatus.OUT_OF_STOCK) {
        throw new Error(`Sản phẩm ${sku.product.name} đã hết. Vui lòng chọn sản phẩm khác`)
      }

      return {
        sku,
        quantity: skuItem.quantity,
      }
    })
    return skuPromises
  }
  async CreateOrdersForGuest({
    guestId,
    orderItems,
    createdById,
  }: {
    guestId: number
    orderItems: CreateNewOrderType
    createdById?: number
  }): Promise<OrderResType> {
    try {
      const checkAndDeductStock = await this.validateIngredientByLuaBeforeCreateOrder(orderItems)
      return await this.prismaService.$transaction(async (tx) => {
        const guest = await tx.guest.findUnique({
          where: {
            id: Number(guestId),
            deletedAt: null,
          },
        })

        if (!guest) {
          throw new Error('Không tìm thấy người dùng')
        }
        if (guest.tableNodeId == null) {
          throw new Error('Bàn của bạn đã bị xóa, vui lòng đăng xuất và đăng nhập lại một bàn mới')
        }

        //check table
        const table = await this.validateTableBeforeCreateOrder({
          tableNodeId: guest.tableNodeId,
          tx,
        })

        //checkSku
        // const skuPromises = orderItems.map(async (skuItem) => {
        //   const sku = await tx.sKU.findUniqueOrThrow({
        //     where: {
        //       id: skuItem.skuId,
        //       deletedAt: null,
        //     },
        //     include: {
        //       product: {
        //         include: {
        //           productTranslations: true,
        //         },
        //       },
        //     },
        //   })

        //   if (sku.status == SkuStatus.HIDDEN) {
        //     throw new Error(`Sản phẩm ${sku.product.name} đã bị ẩn. Vui lòng chọn sản phẩm khác`)
        //   }

        //   if (sku.status == SkuStatus.OUT_OF_STOCK) {
        //     throw new Error(`Sản phẩm ${sku.product.name} đã hết. Vui lòng chọn sản phẩm khác`)
        //   }

        //   return {
        //     sku,
        //     quantity: skuItem.quantity,
        //   }
        // })
        const skuPromises = await this.validateSku({
          orderItems,
          tx,
        })
        const validatedSkus = await Promise.all(skuPromises)

        // Tinh tien bang Decimal (ADR 0001 D5/D6); tip khoan lam => 0
        const money = computeOrderMoney({
          lines: validatedSkus.map((item) => ({ price: item.sku.price, quantity: item.quantity })),
          taxRate: table.taxRate,
          serviceChargeRate: table.serviceChargeRate,
          pricesIncludeTax: table.pricesIncludeTax,
        })

        const payment = await tx.payment.create({
          data: {
            // truoc day gan nham OrderStatus.PENDING vao Payment.status
            status: PaymentStatus.PENDING,
            amount: money.grandTotal,
            branchId: table.branchId,
          },
        })

        const order = await tx.order.create({
          data: {
            guestId,
            status: OrderStatus.PENDING,
            type: TypeToOrderStatus.AT_TABLE,
            tableNodeId: table.id,
            branchId: table.branchId,
            subtotal: money.subtotal,
            discountTotal: money.discountTotal,
            serviceChargeRate: money.serviceChargeRate,
            serviceChargeAmount: money.serviceChargeAmount,
            taxRate: money.taxRate,
            taxTotal: money.taxTotal,
            tipAmount: money.tipAmount,
            grandTotal: money.grandTotal,
            items: {
              create: validatedSkus.map((item) => ({
                skuValue: item.sku.value,
                image: item.sku.product.images[0] ?? '',
                productName: item.sku.product.name,
                quantity: item.quantity,
                sku: { connect: { id: item.sku.id } },
                skuPrice: item.sku.price,
                productTranslations: item.sku.product.productTranslations,
                product: { connect: { id: item.sku.productId } },
              })),
            },
            paymentId: payment.id,
            createdById: createdById ?? null,
          },
          include: {
            tableNode: {
              select: {
                name: true,
              },
            },
            guest: {
              omit: {
                refreshToken: true,
                refreshTokenExpiresAt: true,
              },
            },
            items: {
              include: {
                product: {
                  include: {
                    productSKUSnapshots: true,
                  },
                },
              },
            },
          },
        })

        await this.inventoryQueue.add(
          Inventory_Queue,
          {
            orderId: order.id,
            updatedIngredients: checkAndDeductStock.updated, //mang nglieu đc tru vao redis
            lowStockItems: checkAndDeductStock.lowStock || [], // Truyền thông tin lowStock
          },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: true,
            removeOnFail: true,
          },
        )

        this.appGateway.server.to(ManagerRoom).emit(WS_EVENTS.NEW_ORDER, order)

        const socketRecord = await this.prismaService.socket.findFirst({
          where: {
            guestId: guestId,
          },
        })

        if (socketRecord) {
          this.appGateway.server.to(socketRecord.socketId).emit(WS_EVENTS.ORDER_STATUS_UPDATED, {
            message: 'Đơn hàng đã được tạo thành công',
            orderId: order.id,
            status: order.status,
            createdAt: order.createdAt,
            timestamp: new Date().toISOString(),
          })
        }

        return toMoneyNumbers(order)
      })
    } catch (error) {
      console.log(error)
      throw error
    }
  }
  // async CreateOrdersForUser({
  //   userId,
  //   tableNodeId,
  //   orderItems,
  //   createdById,
  //   depositAmount,
  //   reservationId,
  //   tx
  // }: {
  //   userId: number
  //   orderItems: CreateNewOrderType
  //   tableNodeId: number
  //   createdById?: number
  //   depositAmount?: number
  //   reservationId: number
  //   tx: Prisma.TransactionClient
  // }): Promise<OrderResType> {
  //   try {
  //     const checkAndDeductStock = await this.validateIngredientByLuaBeforeCreateOrder(orderItems)
  //     return await this.prismaService.$transaction(async (tx) => {
  //       const user = await tx.user.findUnique({
  //         where: {
  //           id: Number(userId),
  //           deletedAt: null,
  //         },
  //       })

  //       if (!user) {
  //         throw new Error('Không tìm thấy người dùng')
  //       }

  //       //check table
  //       const table = await this.validateTableBeforeCreateOrder({
  //         tableNodeId,
  //         tx,
  //       })

  //       //checkSku
  //       // const skuPromises = orderItems.map(async (skuItem) => {
  //       //   const sku = await tx.sKU.findUniqueOrThrow({
  //       //     where: {
  //       //       id: skuItem.skuId,
  //       //       deletedAt: null,
  //       //     },
  //       //     include: {
  //       //       product: {
  //       //         include: {
  //       //           productTranslations: true,
  //       //         },
  //       //       },
  //       //     },
  //       //   })

  //       //   if (sku.status == SkuStatus.HIDDEN) {
  //       //     throw new Error(`Sản phẩm ${sku.product.name} đã bị ẩn. Vui lòng chọn sản phẩm khác`)
  //       //   }

  //       //   if (sku.status == SkuStatus.OUT_OF_STOCK) {
  //       //     throw new Error(`Sản phẩm ${sku.product.name} đã hết. Vui lòng chọn sản phẩm khác`)
  //       //   }

  //       //   return {
  //       //     sku,
  //       //     quantity: skuItem.quantity,
  //       //   }
  //       // })
  //       const skuPromises = await this.validateSku({
  //         orderItems,
  //         tx,
  //       })
  //       const validatedSkus = await Promise.all(skuPromises)

  //       const payment = await tx.payment.create({
  //         data: {
  //           status: OrderStatus.PENDING,
  //           amount: depositAmount
  //             ? depositAmount
  //             : validatedSkus.reduce((total, item) => total + item.sku.price * item.quantity, 0),
  //         },
  //       })

  //       const order = await tx.order.create({
  //         data: {
  //           userId,
  //           status: OrderStatus.PENDING,
  //           type: TypeToOrderStatus.RESERVATION,
  //           tableNodeId: table.id,
  //           items: {
  //             create: validatedSkus.map((item) => ({
  //               skuValue: item.sku.value,
  //               image: item.sku.product.images[0] ?? '',
  //               productName: item.sku.product.name,
  //               quantity: item.quantity,
  //               sku: { connect: { id: item.sku.id } },
  //               skuPrice: item.sku.price,
  //               productTranslations: item.sku.product.productTranslations,
  //               product: { connect: { id: item.sku.productId } },
  //             })),
  //           },
  //           paymentId: payment.id,
  //           createdById: createdById ?? null,
  //           reservationId,
  //         },
  //         include: {
  //           tableNode: {
  //             select: {
  //               name: true,
  //             },
  //           },
  //           user: {
  //             omit: {
  //               totpSecret: true,
  //             },
  //           },
  //           items: {
  //             include: {
  //               product: {
  //                 include: {
  //                   productSKUSnapshots: true,
  //                 },
  //               },
  //             },
  //           },
  //         },
  //       })

  //       await this.inventoryQueue.add(
  //         Inventory_Queue,
  //         {
  //           orderId: order.id,
  //           updatedIngredients: checkAndDeductStock.updated, //mang nglieu đc tru vao redis
  //           lowStockItems: checkAndDeductStock.lowStock || [], // Truyền thông tin lowStock
  //         },
  //         {
  //           attempts: 3,
  //           backoff: {
  //             type: 'exponential',
  //             delay: 2000,
  //           },
  //           removeOnComplete: true,
  //           removeOnFail: true,
  //         },
  //       )

  //       this.appGateway.server.to(ManagerRoom).emit(WS_EVENTS.NEW_ORDER, order)

  //       const socketRecord = await this.prismaService.socket.findFirst({
  //         where: {
  //           userId,
  //         },
  //       })

  //       if (socketRecord) {
  //         this.appGateway.server.to(socketRecord.socketId).emit(WS_EVENTS.ORDER_STATUS_UPDATED, {
  //           message: 'Đơn hàng đã được tạo thành công',
  //           orderId: order.id,
  //           status: order.status,
  //           createdAt: order.createdAt,
  //           timestamp: new Date().toISOString(),
  //         })
  //       }
  //       return order
  //     })
  //   } catch (error) {
  //     console.log('[ERROR]', error)
  //     throw error
  //   }
  // }
  async CreateOrdersForUser({
    userId,
    tableNodeId,
    orderItems,
    createdById,
    depositAmount,
    reservationId,
    tx,
  }: {
    userId: number
    orderItems: CreateNewOrderType
    tableNodeId: number
    createdById?: number
    depositAmount?: number
    reservationId: number
    tx: Prisma.TransactionClient
  }): Promise<OrderResType> {
    try {
      const checkAndDeductStock = await this.validateIngredientByLuaBeforeCreateOrder(orderItems)

      const user = await tx.user.findUnique({
        where: {
          id: Number(userId),
          deletedAt: null,
        },
      })

      if (!user) {
        throw new Error('Không tìm thấy người dùng')
      }

      const table = await this.validateTableBeforeCreateOrder({
        tableNodeId,
        tx,
      })

      const skuPromises = await this.validateSku({
        orderItems,
        tx,
      })

      const validatedSkus = await Promise.all(skuPromises)

      const money = computeOrderMoney({
        lines: validatedSkus.map((item) => ({ price: item.sku.price, quantity: item.quantity })),
        taxRate: table.taxRate,
        serviceChargeRate: table.serviceChargeRate,
        pricesIncludeTax: table.pricesIncludeTax,
      })
      // Dat coc: so tien can thu la tien coc, con grandTotal van la gia tri don
      const amountToPay = depositAmount ? depositAmount : money.grandTotal

      const payment = await tx.payment.create({
        data: {
          status: PaymentStatus.PENDING,
          amount: amountToPay,
          branchId: table.branchId,
        },
      })

      const order = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          type: TypeToOrderStatus.RESERVATION,
          tableNodeId: table.id,
          branchId: table.branchId,
          subtotal: money.subtotal,
          discountTotal: money.discountTotal,
          serviceChargeRate: money.serviceChargeRate,
          serviceChargeAmount: money.serviceChargeAmount,
          taxRate: money.taxRate,
          taxTotal: money.taxTotal,
          tipAmount: money.tipAmount,
          grandTotal: money.grandTotal,
          items: {
            create: validatedSkus.map((item) => ({
              skuValue: item.sku.value,
              image: item.sku.product.images[0] ?? '',
              productName: item.sku.product.name,
              quantity: item.quantity,
              sku: { connect: { id: item.sku.id } },
              skuPrice: item.sku.price,
              productTranslations: item.sku.product.productTranslations,
              product: { connect: { id: item.sku.productId } },
            })),
          },
          paymentId: payment.id,
          createdById: createdById ?? null,
          reservationId,
        },
        include: {
          tableNode: {
            select: { name: true },
          },
          user: {
            omit: { totpSecret: true },
          },
          items: {
            include: {
              product: {
                include: {
                  productSKUSnapshots: true,
                },
              },
            },
          },
        },
      })

      await this.inventoryQueue.add(
        Inventory_Queue,
        {
          orderId: order.id,
          updatedIngredients: checkAndDeductStock.updated,
          lowStockItems: checkAndDeductStock.lowStock || [],
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      )

      this.appGateway.server.to(ManagerRoom).emit(WS_EVENTS.NEW_ORDER, order)

      const socketRecord = await this.prismaService.socket.findFirst({
        where: { userId },
      })

      if (socketRecord) {
        this.appGateway.server.to(socketRecord.socketId).emit(WS_EVENTS.ORDER_STATUS_UPDATED, {
          message: 'Đơn hàng đã được tạo thành công',
          orderId: order.id,
          status: order.status,
          createdAt: order.createdAt,
          timestamp: new Date().toISOString(),
        })
      }

      return toMoneyNumbers(order)
    } catch (error) {
      console.log('[ERROR]', error)
      throw error
    }
  }

  async updateOrder({
    data,
    updatedById,
  }: {
    data: UpdateOrderType & { orderId: number }
    updatedById: number
  }): Promise<UpdateOrderResType> {
    const { orderId, skuId, quantity, status } = data
    try {
      const result = await this.prismaService.$transaction(async (tx) => {
        await tx.productSKUSnapshot.updateMany({
          where: {
            orderId: orderId,
            skuId: skuId,
          },
          data: {
            quantity: quantity,
          },
        })
        const updatedOrder = await tx.order.update({
          where: {
            id: orderId,
          },
          data: {
            status,
            updatedById,
          },
          include: {
            items: {
              include: {
                product: {
                  include: {
                    productSKUSnapshots: true,
                  },
                },
              },
            },
            guest: true,
            tableNode: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })

        return updatedOrder
      })
      if (!result.guest?.id) {
        return {
          order: result,
          socketId: '',
        } as any
      }
      const socketRecord = await this.prismaService.socket.findFirst({
        where: {
          guestId: result.guest!.id,
        },
      })

      if (socketRecord) {
        this.appGateway.server.to(socketRecord.socketId).emit(WS_EVENTS.ORDER_STATUS_UPDATED, {
          message: 'Trạng thái đơn hàng đã được cập nhật',
          order: result,
        })
      }

      return {
        order: result,
        socketId: socketRecord?.socketId || '',
      } as any
    } catch (error) {
      console.log(error)
      throw error
    }
  }
}
