import { PrismaService } from '@/shared/service/prisma.service'
import { resolveBranchId } from '@/shared/service/branch.resolver'
import { Injectable } from '@nestjs/common'
import { ReservationRepo } from './reservation.repo'
import { ReservationBaseQueryType, ReservationBodyType } from './reservation.model'
import { Prisma } from '@prisma/client'
import { SharedReservationRepo } from '@/shared/shared-repository/shared-reservation.repo'
import { Request } from 'express'
import { ForbiddenAccessException, NotFoundReservationException } from './reservation.error'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { roleName } from '@/shared/constants/role.constant'

@Injectable()
export class ReservationCustomerService {
  constructor(
    private readonly reservationRepo: ReservationRepo,
    private readonly sharedReservationRepo: SharedReservationRepo,
    private readonly prismaService: PrismaService,
  ) {}

  private buildCustomerWhere(userId: number, query: ReservationBaseQueryType) {
    const where: Prisma.ReservationWhereInput = {
      userId,
      deletedAt: null,
    }

    if (query.status) where.status = query.status
    if (query.date) {
      where.reservationTime = {
        gte: new Date(query.date),
        lt: new Date(new Date(query.date).getTime() + 24 * 60 * 60 * 1000),
      }
    }

    return where
  }
  async create({ body, userId, req }: { body: ReservationBodyType; userId: number; req: Request }) {
    return await this.reservationRepo.createNewReservation({
      body,
      req,
      userId,
    })
  }

  async list(query: ReservationBaseQueryType, user: AccessTokenPayload) {
    if (user.roleName !== roleName.ADMIN && user.roleName !== roleName.STAFF) {
      throw ForbiddenAccessException
    }
    const where = await this.buildCustomerWhere(user.userId, query)
    where.branchId = await resolveBranchId(this.prismaService, { userId: user.userId })
    return await this.reservationRepo.list(query, where)
  }
  async findByIdDetail(id: number) {
    try {
      const reservationRes = await this.sharedReservationRepo.findByIdDetail(id)
      if (!reservationRes) throw NotFoundReservationException
      return reservationRes
    } catch (error) {
      throw error
    }
  }
}
