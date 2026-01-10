import { Injectable } from '@nestjs/common'
import { MessageRepo } from './message.repo'
import { SendGuestMessageType, SendUserMessageType, MarkAsReadType, SendAdminToGuestMessageType } from './message.model'
import { AppGateway } from '@/webSockets/app.gateway'
import { ManagerRoom, WS_EVENTS } from '@/shared/constants/others.constant'
import { MessageResType } from '@/shared/models/respone.model'
import { PrismaService } from '@/shared/service/prisma.service'
import envConfig from '@/shared/config'

@Injectable()
export class MessageService {
  constructor(
    private readonly messageRepo: MessageRepo,
    private readonly appGateway: AppGateway,
    private readonly prismaService: PrismaService,
  ) {}

  async sendGuestMessage(data: SendGuestMessageType & { fromGuestId: number }): Promise<MessageResType> {
    const message = await this.messageRepo.sendGuestMessage(data)

    const messagePayload = {
      message,
      guestName: message.fromGuest?.name,
      tableName: message.fromGuest?.tableNode?.name,
      guestId: data.fromGuestId,
      timestamp: new Date(),
    }

    // Find admin socket from database
    const adminSocket = await this.prismaService.socket.findFirst({
      where: {
        userId: parseInt(envConfig.ADMIN_ID),
      },
    })

    // Emit to admin socket if exists (user is connected)
    if (adminSocket) {
      this.appGateway.server.to(adminSocket.socketId).emit(WS_EVENTS.GUEST_MESSAGE_TO_ADMIN, messagePayload)
      console.log(`Sent message to admin socket: ${adminSocket.socketId}`)
    } else {
      console.log('Admin is offline, message will be sent to ManagerRoom')
    }

    // Always emit to ManagerRoom (fallback for when admin is offline or multiple admin connections)
    this.appGateway.server.to(ManagerRoom).emit(WS_EVENTS.GUEST_MESSAGE_TO_ADMIN, messagePayload)

    return {
      message: 'Message sent successfully',
    }
  }

  async sendUserMessage(data: SendUserMessageType & { fromUserId: number }): Promise<MessageResType> {
    await this.messageRepo.sendUserMessage(data)

    return {
      message: 'Message sent successfully',
    }
  }

  async sendAdminToGuestMessage(data: SendAdminToGuestMessageType & { fromUserId: number }): Promise<MessageResType> {
    const message = await this.messageRepo.sendAdminToGuestMessage(data)

    // Tìm socket của guest để emit tin nhắn
    const guestSocket = await this.prismaService.socket.findFirst({
      where: {
        guestId: data.guestId,
      },
    })

    const messagePayload = {
      message: {
        id: message.id,
        content: message.content,
        fromUserId: message.fromUserId,
        fromGuestId: message.fromGuestId,
        createdAt: message.createdAt,
      },
      fromUser: message.fromUser,
      guestId: data.guestId,
      timestamp: new Date(),
    }

    // Emit đến guest nếu đang online
    if (guestSocket) {
      this.appGateway.server.to(guestSocket.socketId).emit(WS_EVENTS.ADMIN_MESSAGE_TO_GUEST, messagePayload)
      console.log(`Sent admin message to guest socket: ${guestSocket.socketId}`)
    } else {
      console.log(`Guest ${data.guestId} is offline, message saved but not delivered`)
    }

    return {
      message: 'Message sent successfully',
    }
  }

  async getGuestMessages(guestId: number) {
    return await this.messageRepo.getGuestMessages(guestId)
  }

  async getUnreadMessagesForAdmin() {
    return await this.messageRepo.getUnreadMessagesForAdmin()
  }

  async markAsRead(data: MarkAsReadType): Promise<MessageResType> {
    await this.messageRepo.markAsRead(data)

    return {
      message: 'Messages marked as read',
    }
  }

  async getConversationWithGuest(guestId: number, userId?: number) {
    const targetUserId = userId || parseInt(envConfig.ADMIN_ID)
    return await this.messageRepo.getConversationWithGuest(targetUserId, guestId)
  }

  async getMessagesReceivedByUser(userId?: number) {
    const targetUserId = userId || parseInt(envConfig.ADMIN_ID)
    return await this.messageRepo.getMessagesReceivedByUser(targetUserId)
  }

  async getActiveGuests() {
    return await this.messageRepo.getActiveGuests()
  }

  async getGuestsWithMessages(userId?: number) {
    const targetUserId = userId || parseInt(envConfig.ADMIN_ID)
    return await this.messageRepo.getGuestsWithMessages(targetUserId)
  }
}
