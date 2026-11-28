import { toMoneyNumbers } from '@/shared/service/money-serializer'
import { computeOrderMoney } from '@/shared/service/order-money'
import { CACHE_KEYS } from '@/cache/cache.constant'
import { CacheService } from '@/cache/services/cache.service'
import { deduct_stock, revert_stock } from '@/shared/constants/lua.constant'
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
import { AuditLogService } from '@/shared/service/audit-log.service'
import { VoucherService } from '@/shared/service/voucher.service'
import { LedgerPostingService } from '@/shared/service/ledger-posting.service'
import { AppGateway } from '@/webSockets/app.gateway'
import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException } from '@nestjs/common'
import { Queue } from 'bullmq'
import { TableNodeType } from '../models/shared-tableNode.model'
import { Prisma, PrismaClient } from '@prisma/client'
type PrismaTransaction = Prisma.TransactionClient

/**
 * Cạnh chuyển trạng thái được phép. Không có `CANCELLED → *` (đơn đã huỷ không "sống lại") và
 * `PAID` chỉ đi tới `CANCELLED` (huỷ đơn đã thu = hoàn tiền, xử lý trong `updateOrder`).
 */
export const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.CANCELLED],
  [OrderStatus.CANCELLED]: [],
}

export class SharedOrdersRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    @InjectQueue(Inventory_Queue) private readonly inventoryQueue: Queue,
    private readonly appGateway: AppGateway,
    private readonly auditLogService: AuditLogService,
    private readonly voucherService: VoucherService,
    private readonly ledgerPosting: LedgerPostingService,
  ) {}

  /**
   * Trả lại phần tồn kho đã trừ trên Redis khi transaction tạo đơn KHÔNG commit.
   * Chỉ gọi ở nhánh lỗi, với danh sách `deducted` do Lua trả về nên hoàn đúng số đã trừ.
   */
  private async revertDeductedStock(deducted: { ingredientId: number; quantity: number }[]) {
    if (!deducted.length) return
    const revertScript = this.redisService.luaScripts.get(revert_stock.split('.')[0])
    if (!revertScript) return
    try {
      await this.redisService.runLuaScript<{ success: boolean }>(revertScript, deducted)
    } catch (revertError) {
      console.error('[stock] Không hoàn tác được phần tồn kho đã trừ trên Redis', revertError)
    }
  }

  /**
   * Hoàn tiền cho đơn đã thu: ghi **bút toán đảo** (sự kiện gốc + đảo, không sửa bản gốc),
   * đảo luôn giá vốn, và đánh dấu `Payment` REFUNDED.
   *
   * `idempotencyKey` theo `paymentId` ⇒ huỷ 2 lần chỉ sinh 1 bút toán đảo.
   */
  private async refundPaidOrder(
    tx: PrismaTransaction,
    args: { orderId: number; paymentId: number; branchId: number; updatedById: number; reason: string },
  ) {
    const { orderId, paymentId, branchId, updatedById, reason } = args

    const original = await tx.ledgerEntry.findFirst({
      where: {
        branchId,
        refType: { in: ['ORDER_PAID_CASH', 'ORDER_PAID_VNPAY'] },
        refId: paymentId,
        status: 'POSTED',
      },
      include: { lines: { include: { account: true } } },
    })

    if (original) {
      await this.ledgerPosting.postEntry(
        {
          branchId,
          refType: 'REFUND',
          refId: paymentId,
          idempotencyKey: `refund:payment:${paymentId}`,
          reversalOfId: original.id,
          memo: reason,
          lines: original.lines.map((line) => ({
            accountCode: line.account.code,
            direction: line.direction === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const),
            amount: line.amount,
            orderId,
            paymentId,
          })),
        },
        tx,
      )
    }

    // Đảo giá vốn: đơn bị huỷ thì hàng coi như nhập lại kho, COGS không còn.
    const cogs = await tx.ledgerEntry.findFirst({
      where: { branchId, refType: 'ORDER_COGS', refId: orderId, status: 'POSTED' },
      include: { lines: { include: { account: true } } },
    })
    if (cogs) {
      await this.ledgerPosting.postEntry(
        {
          branchId,
          refType: 'REVERSAL',
          refId: orderId,
          idempotencyKey: `reversal:cogs:${orderId}`,
          reversalOfId: cogs.id,
          memo: reason,
          lines: cogs.lines.map((line) => ({
            accountCode: line.account.code,
            direction: line.direction === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const),
            amount: line.amount,
            orderId,
          })),
        },
        tx,
      )
    }

    const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { amount: true } })
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.REFUNDED, refundedAmount: payment?.amount ?? new Prisma.Decimal(0) },
    })

    await this.auditLogService.record(
      {
        actorId: updatedById,
        actorRole: null,
        action: 'PAYMENT_REFUNDED',
        entityType: 'PAYMENT',
        entityId: paymentId,
        before: { status: PaymentStatus.SUCCESS, amount: payment?.amount?.toString() ?? null },
        after: { status: PaymentStatus.REFUNDED, orderId },
        reason,
        branchId,
      },
      tx,
    )
  }

  /**
   * Nguyên liệu đã dùng cho các dòng đơn — dùng để **hoàn kho khi huỷ đơn**.
   *
   * Tính từ dữ liệu DB (`SKURecipeIngredient` + `UnitConversion`) chứ không đọc cache: hoàn kho
   * phải đúng kể cả khi cache công thức đang cũ. Đơn vị được quy đổi về đơn vị của nguyên liệu.
   */
  private async computeOrderIngredientUsage(
    tx: PrismaTransaction,
    items: { skuId: number; quantity: number }[],
  ): Promise<{ ingredientId: number; quantity: number }[]> {
    const usable = items.filter((item) => item.quantity > 0)
    const skuIds = [...new Set(usable.map((item) => item.skuId))]
    if (skuIds.length === 0) return []

    const [recipes, conversions] = await Promise.all([
      tx.sKURecipeIngredient.findMany({ where: { skuId: { in: skuIds }, deletedAt: null } }),
      tx.unitConversion.findMany({
        where: { deletedAt: null },
        select: { fromUnitId: true, toUnitId: true, factor: true },
      }),
    ])
    if (recipes.length === 0) return []

    const ingredientIds = [...new Set(recipes.map((recipe) => recipe.ingredientId))]
    const ingredients = await tx.ingredient.findMany({
      where: { id: { in: ingredientIds } },
      select: { id: true, unitId: true },
    })
    const ingredientUnit = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.unitId]))
    const factors = new Map(conversions.map((c) => [`${c.fromUnitId}:${c.toUnitId}`, c.factor]))

    const totals = new Map<number, number>()
    for (const item of usable) {
      for (const recipe of recipes) {
        if (recipe.skuId !== item.skuId) continue
        const targetUnit = ingredientUnit.get(recipe.ingredientId)
        if (!targetUnit) continue

        let quantity = recipe.quantity * item.quantity
        if (recipe.unitId !== targetUnit) {
          const factor = factors.get(`${recipe.unitId}:${targetUnit}`)
          if (!factor) {
            console.warn(
              `[stock] thiếu quy đổi ${recipe.unitId}→${targetUnit} cho nguyên liệu #${recipe.ingredientId}, bỏ qua khi hoàn kho`,
            )
            continue
          }
          quantity *= factor
        }
        totals.set(recipe.ingredientId, (totals.get(recipe.ingredientId) ?? 0) + quantity)
      }
    }

    return [...totals.entries()].map(([ingredientId, quantity]) => ({ ingredientId, quantity }))
  }

  async validateIngredientByLuaBeforeCreateOrder(orderItems: CreateNewOrderType): Promise<{
    errors: any[]
    updated: any[]
    lowStock: any[]
    /** đã trừ bao nhiêu mỗi nguyên liệu — để job đồng bộ DB hoàn tác đúng số (ticket #17) */
    deducted: { ingredientId: number; quantity: number }[]
  }> {
    const luaScript = this.redisService.luaScripts.get(deduct_stock.split('.')[0])
    if (!luaScript) {
      throw new Error('Lua script for stock deduction not loaded')
    }
    const rawDeduct = await this.redisService.runLuaScript<{
      errors: any[] | Record<string, never>
      updated: any[] | Record<string, never>
      lowStock: any[] | Record<string, never>
      deducted: { ingredientId: number; quantity: number }[] | Record<string, never>
    }>(luaScript, orderItems)

    // Lua trả bảng RỖNG dưới dạng `{}` (cjson không phân biệt array/object) -> chuẩn hoá về mảng,
    // nếu không `for..of` sẽ nổ "not iterable" đúng vào lúc thuận lợi nhất (không có lỗi nào).
    const checkAndDeductStock = {
      errors: Array.isArray(rawDeduct.errors) ? rawDeduct.errors : [],
      updated: Array.isArray(rawDeduct.updated) ? rawDeduct.updated : [],
      lowStock: Array.isArray(rawDeduct.lowStock) ? rawDeduct.lowStock : [],
      deducted: Array.isArray(rawDeduct.deducted) ? rawDeduct.deducted : [],
    }

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
            // Lua trả skuId dạng CHUỖI -> Prisma cần số, không thì nổ 500 khi đang báo lỗi cho người dùng
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
    voucherCode,
  }: {
    guestId: number
    orderItems: CreateNewOrderType
    createdById?: number
    /** mã voucher khách nhập — áp trong cùng transaction, ghi snapshot kèm giá trị giảm thực tế */
    voucherCode?: string
  }): Promise<OrderResType> {
    /** Phần đã trừ trên Redis — phải trả lại nếu transaction không commit (xem catch bên dưới). */
    let deductedForRevert: { ingredientId: number; quantity: number }[] = []
    try {
      const checkAndDeductStock = await this.validateIngredientByLuaBeforeCreateOrder(orderItems)
      deductedForRevert = checkAndDeductStock.deducted ?? []
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
        const lines = validatedSkus.map((item) => ({ price: item.sku.price, quantity: item.quantity }))
        const subtotal = lines
          .reduce((total, line) => total.add(new Prisma.Decimal(line.price).mul(line.quantity)), new Prisma.Decimal(0))
          .toDecimalPlaces(0)

        // Voucher (ticket #02): kiểm + ghi snapshot TRONG transaction; snapshot giữ đúng số tiền
        // đã giảm nên đơn cũ không đổi số khi voucher bị sửa/xoá về sau.
        const voucher = voucherCode?.trim()
          ? await this.voucherService.applyVoucher({ code: voucherCode, subtotal }, tx)
          : null

        const money = computeOrderMoney({
          lines,
          discountTotal: voucher?.appliedDiscount ?? 0,
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
                productTranslations: item.sku.product.productTranslations.filter((t) => t.languageId === 'vi'),
                product: { connect: { id: item.sku.productId } },
              })),
            },
            paymentId: payment.id,
            voucherSnapshotId: voucher?.snapshotId ?? null,
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
            deducted: checkAndDeductStock.deducted ?? [], // số đã trừ, để hoàn tác đúng nếu DB lỗi
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
      // Tồn kho đã bị trừ trên Redis TRƯỚC transaction. Mọi lỗi sau đó (bàn vừa bị đặt, SKU ẩn,
      // voucher sai, lỗi DB) trước đây chỉ log rồi ném ra ⇒ kho mất hàng mà không có đơn nào.
      await this.revertDeductedStock(deductedForRevert)
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
  //               productTranslations: item.sku.product.productTranslations.filter((t) => t.languageId === 'vi'),
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
    /** Phần đã trừ trên Redis — trả lại nếu transaction (của caller) không commit. */
    let deductedForRevert: { ingredientId: number; quantity: number }[] = []
    try {
      const checkAndDeductStock = await this.validateIngredientByLuaBeforeCreateOrder(orderItems)
      deductedForRevert = checkAndDeductStock.deducted ?? []

      const user = await tx.user.findUnique({
        where: {
          id: Number(userId),
          deletedAt: null,
        },
      })

      if (!user) {
        throw new Error('Không tìm thấy người dùng')
      }

      /**
       * Đơn đặt trước là của khách đã đặt bàn, nên hồ sơ khách lấy từ chính lượt đặt bàn đó
       * (reservation.repo tạo/gộp hồ sơ trong cùng transaction). Gắn ngay tại đây để mọi báo cáo
       * khách đọc thẳng `Order.customerId`, không phải join qua Reservation mỗi lần.
       */
      const booking = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: { customerId: true },
      })

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
          customerId: booking?.customerId ?? null,
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
              productTranslations: item.sku.product.productTranslations.filter((t) => t.languageId === 'vi'),
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
          // Thiếu `deducted` ở nhánh này (đơn đặt bàn/preorder) ⇒ job không thể hoàn tác kho
          // khi DB lỗi hoặc đơn bị huỷ: kho mất hàng mà không có đơn.
          deducted: checkAndDeductStock.deducted ?? [],
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
      await this.revertDeductedStock(deductedForRevert)
      console.log('[ERROR]', error)
      throw error
    }
  }

  async updateOrder({
    data,
    updatedById,
    actorRole,
    branchId,
  }: {
    data: UpdateOrderType & { orderId: number }
    updatedById: number
    actorRole?: string | null
    /** Chi nhánh của người gọi (`undefined` = ADMIN): chặn sửa đơn của chi nhánh khác. */
    branchId?: number
  }): Promise<UpdateOrderResType> {
    const { orderId, skuId, quantity, status, reason, discountTotal } = data
    if (quantity !== undefined && quantity !== null && !skuId) {
      throw new BadRequestException('Error.SkuRequiredWhenChangingQuantity')
    }
    // Chốt chặn thứ 2: "đã trả tiền" chỉ được đặt qua luồng thanh toán (xem UpdateOrderSchema).
    // Nếu chỉ dựa vào schema, ai đó nới enum ra là lỗ hổng mở lại mà không ai nhớ vì sao.
    // (status đã bị schema loại, so sánh qua string để giữ chốt chặn runtime nếu schema bị nới)
    const nextStatus = String(status)
    if (nextStatus === OrderStatus.PAID || nextStatus === OrderStatus.COMPLETED) {
      throw new BadRequestException('Error.OrderStatusChangedOnlyByPayment')
    }
    const cancelled = status === OrderStatus.CANCELLED
    // Huỷ đơn / hoàn tiền mà không có lý do thì không giải trình được gì (ticket #10)
    if (cancelled && !reason?.trim()) {
      throw new BadRequestException('Error.CancelReasonRequired')
    }

    try {
      const resultPromise = this.prismaService.$transaction(async (tx) => {
        const current = await tx.order.findFirst({
          where: { id: orderId, ...(branchId ? { branchId } : {}) },
          select: {
            id: true,
            status: true,
            branchId: true,
            paymentId: true,
            voucherSnapshotId: true,
            discountTotal: true,
            subtotal: true,
            grandTotal: true,
            taxRate: true,
            serviceChargeRate: true,
            items: { select: { skuId: true, skuPrice: true, quantity: true } },
            payment: { select: { status: true } },
            branch: { select: { pricesIncludeTax: true } },
          },
        })
        if (!current) throw new BadRequestException(`Không tìm thấy đơn #${orderId}`)

        // ---- ma trận trạng thái: chỉ đi theo cạnh có trong bảng, không nhảy cóc/hồi sinh ----
        if (status && status !== current.status && !ALLOWED_TRANSITIONS[current.status]?.includes(status)) {
          throw new BadRequestException('Error.InvalidStatusTransition')
        }

        const paymentStatus = current.payment?.status
        const isPaid = paymentStatus === PaymentStatus.SUCCESS || paymentStatus === PaymentStatus.PARTIALLY_REFUNDED
        const quantityChanged = quantity !== undefined && quantity !== null
        const newDiscount =
          discountTotal === undefined ? current.discountTotal : new Prisma.Decimal(discountTotal)
        const discountChanged = !newDiscount.equals(current.discountTotal)

        /**
         * Đơn đã thu tiền thì KHÔNG được đổi số lượng/giảm giá: sửa tại chỗ sẽ làm
         * `Order.grandTotal` lệch `Payment.amount` lệch sổ cái, mà không có bút toán đảo nào.
         * Muốn đổi: huỷ (có hoàn tiền) rồi tạo đơn mới.
         */
        if (isPaid && (quantityChanged || discountChanged)) {
          throw new BadRequestException('Error.OrderAlreadyPaidCannotChangeMoney')
        }

        if (quantityChanged) {
          await tx.productSKUSnapshot.updateMany({
            where: { orderId, skuId },
            data: { quantity },
          })
        }

        const nextItems = current.items.map((item) => ({
          skuId: item.skuId,
          price: item.skuPrice,
          quantity: quantityChanged && item.skuId === skuId ? quantity! : item.quantity,
        }))

        // ---- tiền: tính lại TỪ SỐ LIỆU MỚI, không chỉ khi đổi giảm giá (ADR 0001 D6) ----
        let moneyUpdate: Record<string, Prisma.Decimal> = {}
        if (quantityChanged || discountChanged) {
          const money = computeOrderMoney({
            lines: nextItems.map((item) => ({ price: item.price, quantity: item.quantity })),
            discountTotal: newDiscount,
            taxRate: current.taxRate,
            serviceChargeRate: current.serviceChargeRate,
            pricesIncludeTax: current.branch?.pricesIncludeTax ?? true,
          })
          moneyUpdate = {
            discountTotal: money.discountTotal,
            subtotal: money.subtotal,
            serviceChargeAmount: money.serviceChargeAmount,
            taxTotal: money.taxTotal,
            grandTotal: money.grandTotal,
          }
          // Chỉ đổi số tiền phải thu khi khách chưa trả; đã trả thì đã chặn ở trên.
          if (current.paymentId && paymentStatus === PaymentStatus.PENDING) {
            await tx.payment.update({
              where: { id: current.paymentId },
              data: { amount: money.grandTotal },
            })
          }
        }

        const updatedOrder = await tx.order.update({
          where: {
            id: orderId,
          },
          data: {
            status,
            updatedById,
            ...moneyUpdate,
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

        // ---- audit trong CÙNG transaction: huỷ đơn rollback thì nhật ký cũng rollback ----
        if (cancelled && current.status !== OrderStatus.CANCELLED) {
          await this.auditLogService.record(
            {
              actorId: updatedById,
              actorRole: actorRole ?? null,
              action: 'ORDER_CANCELLED',
              entityType: 'ORDER',
              entityId: orderId,
              before: { status: current.status, grandTotal: current.grandTotal.toString() },
              after: { status, grandTotal: updatedOrder.grandTotal.toString() },
              reason: reason?.trim(),
              branchId: current.branchId,
            },
            tx,
          )
        }

        if (discountChanged) {
          await this.auditLogService.record(
            {
              actorId: updatedById,
              actorRole: actorRole ?? null,
              action: 'ORDER_DISCOUNT_CHANGED',
              entityType: 'ORDER',
              entityId: orderId,
              before: {
                discountTotal: current.discountTotal.toString(),
                grandTotal: current.grandTotal.toString(),
              },
              after: {
                discountTotal: updatedOrder.discountTotal.toString(),
                grandTotal: updatedOrder.grandTotal.toString(),
              },
              reason: reason?.trim() || null,
              branchId: current.branchId,
            },
            tx,
          )
        }

        /**
         * Huỷ đơn: (1) đơn đã thu tiền ⇒ ghi bút toán đảo + đánh dấu Payment REFUNDED, (2) hoàn
         * nguyên liệu đã trừ. Trước đây chỉ đổi `status` + ghi audit: sổ cái vẫn ghi doanh thu của
         * đơn đã huỷ, và kho mất nguyên liệu vĩnh viễn.
         */
        let stockRestore: { ingredientId: number; quantity: number }[] = []
        if (cancelled && current.status !== OrderStatus.CANCELLED) {
          // Nhả lượt voucher đã giữ lúc tạo đơn — nếu không, hạn mức bị tiêu vĩnh viễn cho đơn huỷ.
          if (current.voucherSnapshotId) {
            const snapshot = await tx.voucherSnapshot.findUnique({
              where: { id: current.voucherSnapshotId },
              select: { voucherId: true },
            })
            if (snapshot) {
              await tx.voucher.updateMany({
                where: { id: snapshot.voucherId, usedCount: { gt: 0 } },
                data: { usedCount: { decrement: 1 } },
              })
            }
          }
          if (isPaid && current.paymentId) {
            await this.refundPaidOrder(tx, {
              orderId,
              paymentId: current.paymentId,
              branchId: current.branchId,
              updatedById,
              reason: reason?.trim() || 'Huỷ đơn đã thanh toán',
            })
          }
          // Trả lại điểm khách đã dùng cho đơn này: đơn huỷ mà điểm vẫn bị trừ thì khách mất hai
          // lần (mất bữa, mất điểm). Không xoá dòng — đánh dấu void để còn đối soát về sau.
          await tx.pointRedemption.updateMany({
            where: { orderId, voidedAt: null },
            data: { voidedAt: new Date() },
          })
          stockRestore = await this.computeOrderIngredientUsage(tx, nextItems)
        }

        return { order: updatedOrder, stockRestore }
      })

      const { order: result, stockRestore } = await resultPromise

      // Hoàn tồn kho trên Redis SAU khi DB đã commit: Lua không nằm trong transaction Prisma.
      if (stockRestore.length > 0) {
        await this.revertDeductedStock(stockRestore)
      }

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
