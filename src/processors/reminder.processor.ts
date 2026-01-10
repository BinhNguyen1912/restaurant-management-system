import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { Logger } from '@nestjs/common'
import { REMINDER_QUEUE, WS_EVENTS } from '@/shared/constants/others.constant'
import { PrismaService } from '@/shared/service/prisma.service'
import { WebSocketRepo } from '@/shared/shared-repository/shared-webSocket'
import { AppGateway } from '@/webSockets/app.gateway'

interface ReminderJobData {
  reminderId: number
  title: string
  description: string | null
  assignedRole: number[] | number
  timestamp: string
}

@Processor(REMINDER_QUEUE)
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name)

  constructor(
    private readonly prismaService: PrismaService,
    private readonly webSocketRepo: WebSocketRepo,
    private readonly appGateway: AppGateway,
  ) {
    super()
  }

  async process(job: Job<ReminderJobData, any, string>): Promise<any> {
    
    if (job.name === 'trigger-reminder') {
      return this.handleTriggerReminder(job)
    } else if (job.name === 'cleanup-reminders') {
      return this.handleCleanupReminders(job)
    }

    throw new Error(`Unknown job name: ${job.name}`)
  }

  private async handleTriggerReminder(job: Job<ReminderJobData>): Promise<any> {
    const { reminderId, title, description, assignedRole, timestamp } = job.data

    try {
      this.logger.log(` [ReminderProcessor] Starting to process reminder: ${title} (Job ID: ${job.id})`)
      this.logger.log(` [ReminderProcessor] Job data: ${JSON.stringify(job.data)}`)

      // assignedRole có thể là array hoặc single value (backward compatibility)
      const roleIds = Array.isArray(assignedRole) ? assignedRole : assignedRole ? [assignedRole] : []

      // Gửi notification broadcast đến tất cả clients
      if (this.appGateway.server) {
        // this.logger.log(` [ReminderProcessor] Emitting 'reminder-triggered' event`)
        this.appGateway.server.emit('reminder-triggered', {
          reminderId,
          title,
          description,
          assignedRole: roleIds,
          timestamp,
          jobId: job.id,
        })
        // this.logger.log(` [ReminderProcessor] 'reminder-triggered' event emitted successfully`)
      } else {
        this.logger.error(' [ReminderProcessor] WebSocket server is not initialized, cannot emit reminder-triggered')
      }

      // Lấy userId từ roleId và gửi đến socketId cụ thể
      if (roleIds.length > 0) {
        const notificationData = {
          reminderId,
          title,
          description,
          assignedRole: roleIds,
          timestamp,
          jobId: job.id,
        }

        // Lấy tất cả userId có roleId trong danh sách assignedRole
        const users = await this.prismaService.user.findMany({
          where: {
            roleId: { in: roleIds },
            deletedAt: null,
          },
          select: {
            id: true,
          },
        })

        const userIds = users.map((user) => user.id)
        // this.logger.log(`Found ${userIds.length} users with roles: ${roleIds.join(', ')}`)

        // Lấy socketId từ userId và gửi notification
        const socketIdsToNotify = new Set<string>()

        for (const userId of userIds) {
          const sockets = await this.webSocketRepo.findManyByUserId(userId)
          sockets.forEach((socket) => {
            if (socket.socketId) {
              socketIdsToNotify.add(socket.socketId)
            }
          })
        }

        // Gửi notification đến từng socketId
        if (this.appGateway.server) {
          for (const socketId of socketIdsToNotify) {
            this.appGateway.server.to(socketId).emit('reminder-notification', notificationData)
            // this.logger.debug(`Sent reminder notification to socket: ${socketId}`)
          }
        } else {
          this.logger.warn('WebSocket server is not initialized, cannot emit reminder-notification')
        }

        // this.logger.log(` [ReminderProcessor] Sent reminder notification to ${socketIdsToNotify.size} socket(s)`)
      } else {
        this.logger.warn(` [ReminderProcessor] No assigned roles, skipping targeted notification`)
      }

      // Có thể tích hợp thêm: gửi email, push notification, SMS
      await this.sendBrowserNotification(title, description || '')

      // this.logger.log(` [ReminderProcessor] Reminder ${reminderId} processed successfully`)

      return { success: true, reminderId, jobId: job.id }
    } catch (error) {
      this.logger.error(`Failed to process reminder ${reminderId}:`, error)

      // Gửi thông báo lỗi
      if (this.appGateway.server) {
        this.appGateway.server.emit('reminder-error', {
          reminderId,
          title,
          error: error.message,
          timestamp: new Date().toISOString(),
        })
      } else {
        this.logger.warn('WebSocket server is not initialized, cannot emit reminder-error')
      }

      throw error 
    }
  }

  private async handleCleanupReminders(job: Job): Promise<any> {
    try {



      return { success: true, cleanedAt: new Date().toISOString() }
    } catch (error) {
      this.logger.error('Failed to cleanup reminders:', error)
      throw error
    }
  }

  private async sendBrowserNotification(title: string, body: string): Promise<void> {
    this.logger.log(`Browser Notification - ${title}: ${body}`)
  }
}
