import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class WebSocketRepo {
  constructor(private readonly prismaService: PrismaService) {}

  findManyByGuestId(guestId: number) {
    return this.prismaService.socket.findMany({
      where: {
        guestId,
      },
    })
  }
  findManyByUserId(userId: number) {
    return this.prismaService.socket.findMany({
      where: {
        userId,
      },
    })
  }
  async create(data: { userId: number; socketId: string } | { guestId: number; socketId: string }) {
    // Nếu có userId, tìm và cập nhật record cũ của user đó
    if ('userId' in data) {
      // Tìm socket cũ của user này
      const existingSockets = await this.prismaService.socket.findMany({
        where: { userId: data.userId },
      })

      // Xóa tất cả socket cũ của user này
      if (existingSockets.length > 0) {
        await this.prismaService.socket.deleteMany({
          where: { userId: data.userId },
        })
      }

      // Tạo record mới
      const newSocket = await this.prismaService.socket.create({
        data: { userId: data.userId, socketId: data.socketId },
      })
      return newSocket
    }

    // Nếu có guestId, tìm và cập nhật record cũ của guest đó
    if ('guestId' in data) {
      // Tìm socket cũ của guest này
      const existingSockets = await this.prismaService.socket.findMany({
        where: { guestId: data.guestId },
      })

      // Xóa tất cả socket cũ của guest này
      if (existingSockets.length > 0) {
        await this.prismaService.socket.deleteMany({
          where: { guestId: data.guestId },
        })
      }

      // Tạo record mới
      const newSocket = await this.prismaService.socket.create({
        data: { guestId: data.guestId, socketId: data.socketId },
      })
      return newSocket
    }
  }

  // Xóa socket khi disconnect
  async deleteBySocketId(socketId: string) {
    return this.prismaService.socket.deleteMany({
      where: { socketId },
    })
  }

  // Tìm socket theo socketId
  async findBySocketId(socketId: string) {
    return this.prismaService.socket.findFirst({
      where: { socketId },
    })
  }

  // Lấy tất cả sockets (để debug)
  async getAllSockets() {
    return this.prismaService.socket.findMany({
      include: {
        user: {
          select: { id: true, email: true },
        },
        guest: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }
}
