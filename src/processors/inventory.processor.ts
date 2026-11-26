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
      const outcome = await this.prisma.$transaction(async (tx) => {
        // Đơn phải còn tồn tại thì mới có việc để làm. Kiểm tra TRƯỚC khi ghi để phân biệt
        // "đơn không còn" (vĩnh viễn, thử lại vô nghĩa) với lỗi tạm thời của DB.
        const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } })
        if (!order) return { kind: 'ORDER_MISSING' as const, missingIngredients: [] as number[] }

        // Dùng updateMany thay vì update: ingredient có thể đã bị xoá (dọn dữ liệu, xoá món) —
        // `update` ném P2025 và làm hỏng CẢ transaction, kéo theo đơn không được đồng bộ.
        const missingIngredients: number[] = []
        for (const item of updatedIngredients) {
          const { count } = await tx.ingredient.updateMany({
            where: { id: item.ingredientId },
            data: { stock: { set: item.newStock } },
          })
          if (count === 0) missingIngredients.push(item.ingredientId)
        }

        // KHÔNG ghi đè `status`. Đơn đã được tạo với PENDING (shared-orders.repo), nên ghi
        // PENDING ở đây là vô nghĩa — nhưng nếu đơn đã bị HUỶ trong lúc chờ job thì ghi đè sẽ
        // làm đơn đã huỷ sống lại thành PENDING.
        return { kind: 'OK' as const, status: order.status, missingIngredients }
      })

      if (outcome.kind === 'ORDER_MISSING') {
        // Thử lại 3 lần cũng không thể tìm ra đơn: hoàn tác phần đã trừ trên Redis ĐÚNG MỘT LẦN
        // rồi kết thúc, thay vì để BullMQ retry và bắn lỗi 3 lần vào log.
        await this.revertStock(deducted, orderId)
        this.logger.warn(`Đơn #${orderId} không còn tồn tại — bỏ qua đồng bộ tồn kho, đã hoàn tác Redis`)
        return { success: false, skipped: 'ORDER_NOT_FOUND' }
      }

      if (outcome.missingIngredients.length > 0) {
        this.logger.warn(
          `Đơn #${orderId}: bỏ qua ${outcome.missingIngredients.length} nguyên liệu đã bị xoá (id: ${outcome.missingIngredients.join(', ')})`,
        )
      }
      if (outcome.status !== OrderStatus.PENDING) {
        this.logger.warn(`Đơn #${orderId} đang ở trạng thái ${outcome.status} — chỉ đồng bộ tồn kho, không đổi trạng thái`)
      }
      const result = outcome

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

      if (!isLastAttempt) {
        this.logger.warn(`Sẽ thử lại (lần ${job.attemptsMade + 1}/${attempts}) — chưa hoàn tác tồn kho`)
      } else {
        await this.revertStock(deducted, orderId)
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

  /** Hoàn tác phần đã trừ trên Redis — gọi đúng MỘT lần cho mỗi job, không gọi mỗi lần retry. */
  private async revertStock(deducted: { ingredientId: number; quantity: number }[], orderId: number) {
    const revertScript = this.redisService.luaScripts.get(revert_stock.split('.')[0])
    if (!revertScript || !deducted.length) {
      this.logger.error(`Không hoàn tác được tồn kho đơn #${orderId}: thiếu danh sách đã trừ`)
      return
    }
    await this.redisService.runLuaScript<{ success: boolean; updated: any[] }>(revertScript, deducted)
    this.logger.warn(`Đã hoàn tác ${deducted.length} nguyên liệu trên Redis cho đơn #${orderId}`)
  }
}
