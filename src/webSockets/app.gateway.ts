import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { WebSocketRepo } from '@/shared/shared-repository/shared-webSocket'
import { PrismaService } from '@/shared/service/prisma.service'
import { ReminderLogRepo } from '@/routes/reminders/remindersLog/remindersLog.repo'
import { TableStatus } from '@/shared/constants/table.constant'
import { ManagerRoom, WS_EVENTS } from '@/shared/constants/others.constant'
import envConfig from '@/shared/config'

@WebSocketGateway({ cors: true, namespace: '/' })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server

  private connectedSockets: string[] = []
  private messageCache = new Map<string, number>() // Cache to prevent duplicate submissions
  private readonly CACHE_TTL = 5000 // 5 seconds

  constructor(
    private readonly webSocketRepo: WebSocketRepo,
    private readonly prismaService: PrismaService,
  ) {}

  handleConnection(client: Socket) {
    if (!this.connectedSockets.includes(client.id)) {
      this.connectedSockets.push(client.id)
    }
    console.log(' Connected sockets:', this.connectedSockets)
  }

  async handleDisconnect(client: Socket) {
    console.log('Disconnect event triggered for socket:', client.id)

    const index = this.connectedSockets.indexOf(client.id)
    if (index > -1) {
      this.connectedSockets.splice(index, 1)
      console.log('Socket removed from connected list:', client.id)
    } else {
      console.log('Socket was not in connected list:', client.id)
      return // Đã xử lý rồi, không cần xử lý lại
    }

    try {
      const socketInfo = await this.webSocketRepo.findBySocketId(client.id)

      if (socketInfo?.guestId) {
        const guest = await this.prismaService.guest.findUnique({
          where: { id: socketInfo.guestId },
          include: { tableNode: true },
        })

        if (guest?.tableNodeId) {
          const activeGuestsOnTable = await this.prismaService.guest.findMany({
            where: {
              tableNodeId: guest.tableNodeId,
              id: { not: guest.id },
            },
          })

          if (activeGuestsOnTable.length === 0) {
            await this.prismaService.tableNode.update({
              where: { id: guest.tableNodeId },
              data: { status: TableStatus.AVAILABLE },
            })
            console.log(`Table ${guest.tableNodeId} set to AVAILABLE after guest ${guest.id} disconnected`)
          }
        }
      }

      await this.webSocketRepo.deleteBySocketId(client.id)
      console.log('Socket removed from database:', client.id)
    } catch (error) {
      console.error('Error removing socket from database:', error)
    }
  }

  // @SubscribeMessage('get-pending-reminders')
  // async handleGetPendingReminders(@ConnectedSocket() client: Socket, @MessageBody() payload?: any) {
  //   // optional filter: roleIds: number[]
  //   const roleIds: number[] | undefined = payload?.roleIds

  //   const filtered =
  //     roleIds && roleIds.length > 0
  //       ? logs.filter(
  //           (l: any) =>
  //             Array.isArray(l.reminder?.assignedRole) &&
  //             l.reminder.assignedRole.some((r: any) => roleIds.includes(r.id)),
  //         )
  //       : logs

  //   // group by reminder_id
  //   const byReminder = new Map<number, { reminder: any; logs: any[] }>()
  //   for (const log of filtered as any[]) {
  //     const key = log.reminder_id
  //     if (!byReminder.has(key)) {
  //       byReminder.set(key, {
  //         reminder: {
  //           id: log.reminder?.id,
  //           title: log.reminder?.title,
  //           description: log.reminder?.description ?? null,
  //           time_to_remind: log.reminder?.time_to_remind,
  //           scheduled_date: log.reminder?.scheduled_date ?? null,
  //           assigned_role: (log.reminder?.assignedRole || []).map((r: any) => r.id),
  //           createdBy: log.reminder?.createdBy || null,
  //         },
  //         logs: [],
  //       })
  //     }
  //     byReminder.get(key)!.logs.push({
  //       id: log.id,
  //       scheduled_at: log.scheduled_at,
  //       status: log.status,
  //       completed_at: log.completed_at ?? null,
  //       completedBy: log.completeBy || null,
  //     })
  //   }

  //   const result = Array.from(byReminder.entries()).map(([reminderId, value]) => ({
  //     reminderId,
  //     ...value,
  //   }))

  //   client.emit('pending-reminders', result)
  // }

  @SubscribeMessage('join-room')
  handleJoinRoom(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    client.join(data.roomId)
    console.log(`User ${client.id} joined room ${data.roomId}`)
    client.emit('joined-room', data.roomId)
  }

  @SubscribeMessage('send-message')
  handleSendMessage(
    @MessageBody() data: { roomId: string; message: string; sender: string },
    @ConnectedSocket() client: Socket,
  ) {
    console.log(`Message from ${data.sender} in room ${data.roomId}: ${data.message}`)

    client.to(data.roomId).emit('receive-message', {
      sender: data.sender,
      message: data.message,
    })
  }

  @SubscribeMessage('get-socket-status')
  handleGetSocketStatus(@ConnectedSocket() client: Socket) {
    client.emit('socket-status', {
      currentSocketId: client.id,
      totalConnected: this.connectedSockets.length,
      allConnectedSockets: this.connectedSockets,
      timestamp: new Date().toISOString(),
    })

    // this.logAllConnectedSockets()
  }

  @SubscribeMessage('guest-send-message')
  async handleGuestMessage(
    @MessageBody() data: { guestId: number; content: string; tableName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Create unique key for this message to prevent duplicates
      const messageKey = `${data.guestId}_${data.content}`
      const previousTimestamp = this.messageCache.get(messageKey)

      // Check if this message was sent recently (within cache TTL)
      if (previousTimestamp && Date.now() - previousTimestamp < this.CACHE_TTL) {
        console.log('Duplicate message detected and blocked:', messageKey)
        return client.emit('message-error', {
          error: 'Message was sent too quickly. Please wait a moment.',
        })
      }

      // Add to cache
      this.messageCache.set(messageKey, Date.now())

      // Clean old cache entries
      setTimeout(() => this.messageCache.delete(messageKey), this.CACHE_TTL)

      // Save message to database ONCE
      const message = await this.prismaService.message.create({
        data: {
          content: data.content,
          fromGuestId: data.guestId,
        },
      })

      // Get guest info for payload
      const guest = await this.prismaService.guest.findUnique({
        where: { id: data.guestId },
        include: { tableNode: true },
      })

      const messagePayload = {
        messageId: message.id,
        message: {
          id: message.id,
          content: message.content,
          fromGuestId: message.fromGuestId,
          createdAt: message.createdAt,
        },
        guestName: guest?.name || 'Guest',
        tableName: data.tableName || guest?.tableNode?.name || 'Unknown Table',
        guestId: data.guestId,
        timestamp: new Date(),
      }

      // 1. Find admin socket from database
      const adminSockets = await this.prismaService.socket.findFirst({
        where: {
          userId: parseInt(envConfig.ADMIN_ID),
        },
      })

      if (adminSockets) {
        this.server.to(adminSockets.socketId).emit(WS_EVENTS.GUEST_MESSAGE_TO_ADMIN, messagePayload)
        console.log(`Sent message to admin socket: ${adminSockets.socketId}`)
      } else {
        console.log('Admin is offline (no sockets found in database)')
      }

      // 2. Always emit to ManagerRoom (fallback for when admin is offline or multiple connections)
      this.server.to(ManagerRoom).emit(WS_EVENTS.GUEST_MESSAGE_TO_ADMIN, messagePayload)

      // Confirm receipt to the guest who sent the message
      client.emit('message-sent', {
        messageId: message.id,
        success: true,
      })

      console.log(`Guest ${data.guestId} sent message: ${data.content}`)
    } catch (error) {
      console.error('Error handling guest message:', error)
      client.emit('message-error', {
        error: 'Failed to send message',
      })
    }
  }

  @SubscribeMessage('join-manager-room')
  handleJoinManagerRoom(@ConnectedSocket() client: Socket) {
    client.join(ManagerRoom)
    console.log(`Client ${client.id} joined ManagerRoom`)
    client.emit('joined-room', ManagerRoom)
  }

  getConnectedSockets(): string[] {
    return this.connectedSockets
  }

  getConnectedSocketsCount(): number {
    return this.connectedSockets.length
  }

  isSocketConnected(socketId: string): boolean {
    return this.connectedSockets.includes(socketId)
  }

  // logAllConnectedSockets(): void {
  //   console.log(' Total connected sockets:', this.connectedSockets.length)
  //   console.log(' Connected socket IDs:', this.connectedSockets)
  // }
}
