import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import {
  SendGuestMessageType,
  SendUserMessageType,
  MarkAsReadType,
  SendAdminToGuestMessageType,
  ActiveGuestType,
  GuestWithMessagesType,
} from './message.model'
import envConfig from '@/shared/config'
@Injectable()
export class MessageRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async sendGuestMessage(data: SendGuestMessageType & { fromGuestId: number }) {
    return await this.prismaService.message.create({
      data: {
        content: data.content,
        fromGuestId: data.fromGuestId,
        toUserId: parseInt(envConfig.ADMIN_ID),
      },
      include: {
        fromGuest: {
          include: {
            tableNode: true,
          },
        },
      },
    })
  }

  async sendUserMessage(data: SendUserMessageType & { fromUserId: number }) {
    return await this.prismaService.message.create({
      data: {
        content: data.content,
        fromUserId: data.fromUserId,
        toUserId: data.toUserId,
      },
      include: {
        fromUser: true,
        toUser: true,
      },
    })
  }

  async sendAdminToGuestMessage(data: SendAdminToGuestMessageType & { fromUserId: number }) {
    return await this.prismaService.message.create({
      data: {
        content: data.content,
        fromUserId: data.fromUserId,
        toGuestId: data.guestId,
      },
      include: {
        fromUser: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        toGuest: {
          include: {
            tableNode: true,
          },
        },
      },
    })
  }

  async getGuestMessages(guestId: number) {
    return await this.prismaService.message.findMany({
      where: {
        fromGuestId: guestId,
      },
      include: {
        fromGuest: {
          include: {
            tableNode: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    })
  }

  async getUnreadMessagesForAdmin() {
    return await this.prismaService.message.findMany({
      where: {
        fromGuestId: { not: null },
        readAt: null,
      },
      include: {
        fromGuest: {
          include: {
            tableNode: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
  }

  async markAsRead(data: MarkAsReadType) {
    return await this.prismaService.message.updateMany({
      where: {
        id: { in: data.messageIds },
      },
      data: {
        readAt: new Date(),
      },
    })
  }

  async getConversationWithGuest(userId: number, guestId: number) {
    // Đánh dấu tin nhắn từ guest -> user này là đã đọc trước khi trả về
    await this.prismaService.message.updateMany({
      where: {
        fromGuestId: guestId,
        toUserId: userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    })

    return await this.prismaService.message.findMany({
      where: {
        OR: [
          { fromGuestId: guestId, toUserId: userId },
          { fromUserId: userId, toGuestId: guestId },
        ],
      },
      include: {
        fromGuest: {
          include: {
            tableNode: true,
          },
        },
        fromUser: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        toUser: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        toGuest: {
          include: {
            tableNode: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })
  }

  async getMessagesReceivedByUser(userId: number) {
    return await this.prismaService.message.findMany({
      where: {
        OR: [
          // Tin nhắn từ guest đến user
          { toUserId: userId, fromGuestId: { not: null } },
          // Tin nhắn từ user đến user (nếu có)
          { toUserId: userId, fromUserId: { not: null } },
        ],
      },
      include: {
        fromGuest: {
          include: {
            tableNode: true,
          },
        },
        fromUser: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
  }

  async getActiveGuests() {
    const activeSockets = await this.prismaService.socket.findMany({
      where: {
        guestId: { not: null },
      },
      include: {
        guest: {
          include: {
            tableNode: true,
          },
        },
      },
    })

    const guestMap = new Map<number, ActiveGuestType>()

    for (const socket of activeSockets) {
      const guest = socket.guest
      if (guest && !guestMap.has(guest.id)) {
        // Đếm tin nhắn chưa đọc từ guest này
        const unreadCount = await this.prismaService.message.count({
          where: {
            fromGuestId: guest.id,
            readAt: null,
          },
        })

        // Lấy tin nhắn mới nhất
        const lastMessage = await this.prismaService.message.findFirst({
          where: {
            fromGuestId: guest.id,
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            content: true,
            createdAt: true,
          },
        })
        const lastMessageCreatedAt = lastMessage?.createdAt

        guestMap.set(guest.id, {
          ...guest,
          unreadCount,
          lastMessage: {
            content: lastMessage?.content || '',
            // Sử dụng giá trị đã được chuyển đổi hoặc giá trị fallback ISO
            createdAt: lastMessageCreatedAt || new Date(),
          },
        })
      }
    }

    return Array.from(guestMap.values())
  }

  /**
   * Lấy danh sách guest có tin nhắn với user
   * @param userId - ID của user
   * @returns Danh sách guest có tin nhắn
   */
  async getGuestsWithMessages(userId: number) {
    // Lấy guest IDs từ messages
    const guestIds = await this.prismaService.message.findMany({
      where: {
        OR: [
          { fromGuestId: { not: null }, toUserId: userId },
          { fromUserId: userId, fromGuestId: { not: null } },
        ],
      },
      select: {
        fromGuestId: true,
      },
      distinct: ['fromGuestId'],
    })

    const uniqueGuestIds = [...new Set(guestIds.map((m) => m.fromGuestId).filter(Boolean))] as number[]

    if (uniqueGuestIds.length === 0) {
      return []
    }

    // Lấy thông tin guest và tin nhắn mới nhất
    const guests = await this.prismaService.guest.findMany({
      where: {
        id: { in: uniqueGuestIds },
      },
      include: {
        tableNode: true,
      },
    })

    // Thêm thông tin tin nhắn cho mỗi guest
    const guestsWithMessages = await Promise.all(
      guests.map(async (guest) => {
        // Đếm tin nhắn chưa đọc
        const unreadCount = await this.prismaService.message.count({
          where: {
            fromGuestId: guest.id,
            toUserId: userId,
            readAt: null,
          },
        })

        // Lấy tin nhắn mới nhất
        const lastMessage = await this.prismaService.message.findFirst({
          where: {
            OR: [
              { fromGuestId: guest.id, toUserId: userId },
              { fromUserId: userId, fromGuestId: guest.id },
            ],
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            content: true,
            createdAt: true,
            fromGuestId: true,
            fromUserId: true,
          },
        })

        return {
          ...guest,
          unreadCount,
          lastMessage,
        }
      }),
    )

    return guestsWithMessages.sort((a, b) => {
      if (b.lastMessage && a.lastMessage) {
        return b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
      }
      return 0
    })
  }
}
