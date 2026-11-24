import { toMoneyNumbers } from '@/shared/service/money-serializer'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../service/prisma.service'
import { GetReservationDetailResType, ReservationType } from '../models/shared-reservation.model'

@Injectable()
export class SharedReservationRepo {
  constructor(private readonly prismaService: PrismaService) {}

  findById(id: number): Promise<ReservationType | null> {
    return this.prismaService.reservation.findUnique({
      where: {
        id,
        deletedAt: null,
      },
    })
  }
  async findByIdDetail(id: number): Promise<GetReservationDetailResType | null> {
    const reservation = await this.prismaService.reservation.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            name: true,
            id: true,
            avatar: true,
            email: true,
          },
        },
        orders: {
          include: {
            items: true,
            products: {
              select: {
                name: true,
              },
            },
          },
        },
        tableNode: {
          select: {
            id: true,
            area: {
              select: {
                name: true,
              },
            },
            name: true,
            seats: true,
            status: true,
          },
        },
      },
    })

    return toMoneyNumbers(reservation)
  }
}
