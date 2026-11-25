import { Job } from 'bullmq'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { RedisService } from '@/shared/service/redis.service'
import { Inventory_Queue, ManagerRoom, WS_EVENTS } from '@/shared/constants/others.constant'
import { revert_stock } from '@/shared/constants/lua.constant'
import { OrderStatus } from '../shared/constants/order.constant'
import { AppGateway } from '@/webSockets/app.gateway'

interface InventoryJobData {
  orderId: number
  updatedIngredients: { ingredientId: number; newStock: number }[]
  /** số lượng đã trừ trên Redis — hoàn tác phải dùng đúng số này (ticket #17) */
  deducted?: { ingredientId: number; quantity: number }[]
  lowStockItems?: { ingredientId: number; newStock: number; minStock: number }[]
}

@Processor(Inventory_Queue)
export class InventoryProcessor extends WorkerHost {
  private readonly logger = new Logger(InventoryProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly appGateway: AppGateway,
  ) {
    super()
  }

  async process(job: Job<InventoryJobData, any, string>): Promise<any> {
    const { orderId, updatedIngredients, deducted = [], lowStockItems } = job.data

    this.logger.log(`Bắt đầu xử lý job đồng bộ tồn kho cho đơn hàng: ${orderId}`)

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Cập nhật stock ingredients
        for (const item of updatedIngredients) {
          await tx.ingredient.update({
            where: { id: item.ingredientId },
            data: { stock: { set: item.newStock } },
          })
        }

        // Cập nhật trạng thái order thành PENDING
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PENDING },
        })
      })

      // Xử lý cảnh báo lowStock nếu có
      if (lowStockItems && lowStockItems.length > 0) {
        this.logger.warn(`Cảnh báo lowStock cho đơn hàng ${orderId}:`, lowStockItems)

        // Lấy thông tin chi tiết nguyên liệu từ DB
        const lowStockDetails = await Promise.all(
          lowStockItems.map(async (item) => {
            const ingredient = await this.prisma.ingredient.findUnique({
              where: { id: item.ingredientId },
              include: { unit: true },
            })
            return {
              ingredientId: item.ingredientId,
              ingredientName: ingredient?.name || `Nguyên liệu ID: ${item.ingredientId}`,
              currentStock: item.newStock,
              minStock: item.minStock,
              unit: ingredient?.unit?.name || 'N/A',
            }
          }),
        )

        // Gửi cảnh báo tới admin
        this.appGateway.server.to(ManagerRoom).emit(WS_EVENTS.LOW_STOCK_WARNING, {
          message: 'Cảnh báo: Một số nguyên liệu đã đạt ngưỡng tối thiểu',
          lowStockItems: lowStockDetails,
          orderId: orderId,
          timestamp: new Date().toISOString(),
        })
        console.log('lowStockDetails at inventory processor', lowStockDetails)
      }

      this.logger.log(`Cập nhật tồn kho và trạng thái đơn hàng thành công cho job: ${job.id}`)
      return {
        success: true,
        result,
      }
    } catch (error) {
      this.logger.error(`Lỗi cập nhật DB. Hoàn tác stock trên Redis: ${error.message}`)

      // Chỉ hoàn tác ở LẦN THỬ CUỐI. BullMQ retry job này nhiều lần; hoàn tác mỗi lần sẽ cộng
      // tồn kho lên gấp bội (bug cũ).
      const attempts = job.opts.attempts ?? 1
      const isLastAttempt = job.attemptsMade + 1 >= attempts
      const revertScript = this.redisService.luaScripts.get(revert_stock.split('.')[0])

      if (!isLastAttempt) {
        this.logger.warn(`Sẽ thử lại (lần ${job.attemptsMade + 1}/${attempts}) — chưa hoàn tác tồn kho`)
      } else if (revertScript && deducted.length) {
        await this.redisService.runLuaScript<{ success: boolean; updated: any[] }>(revertScript, deducted)
        this.logger.warn(`Đã hoàn tác ${deducted.length} nguyên liệu trên Redis cho đơn #${orderId}`)
      } else {
        this.logger.error(`Không hoàn tác được tồn kho đơn #${orderId}: thiếu danh sách đã trừ`)
      }

      // try {
      //   await this.prisma.order.update({
      //     where: { id: orderId },
      //     data: {
      //       status: OrderStatus.CANCELLED,
      //     },
      //   })
      // } catch (updateError) {
      //   this.logger.error(`Failed to update order status to CANCELLED: ${updateError.message}`)
      // }

      throw new Error('Failed to sync stock with database.')
    }
  }
}
