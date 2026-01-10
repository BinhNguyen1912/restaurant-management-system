import { Injectable } from '@nestjs/common'
import { ReservationRepo } from './reservation.repo'
import { StaffReservationQueryType } from './reservation.model'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { roleName } from '@/shared/constants/role.constant'
import { ForbiddenAccessException } from './reservation.error'

@Injectable()
export class ReservationManageService {
  constructor(private readonly reservationRepo: ReservationRepo) {}

  private buildStaffWhere(query: StaffReservationQueryType) {
    const where: any = {}

    if (query.userId) where.userId = query.userId
    if (query.status) where.status = query.status
    if (query.customerPhone) where.customerPhone = { contains: query.customerPhone }
    if (query.tableNodeId) where.tableNodeId = query.tableNodeId
    if (query.search) {
      where.OR = [{ customerName: { contains: query.search } }, { customerPhone: { contains: query.search } }]
    }

    if (query.fromDate || query.toDate) {
      where.reservationTime = {}
      if (query.fromDate) where.reservationTime.gte = new Date(query.fromDate)
      if (query.toDate) where.reservationTime.lte = new Date(query.toDate)
    } else if (query.date) {
      where.reservationTime = {
        gte: new Date(query.date),
        lt: new Date(new Date(query.date).getTime() + 24 * 60 * 60 * 1000),
      }
    }

    return where
  }
  async list(query: StaffReservationQueryType, user: AccessTokenPayload) {
    if (user.roleName != roleName.USER) {
      throw ForbiddenAccessException
    }
    const where = await this.buildStaffWhere(query)
    return await this.reservationRepo.list(query, where)
  }
}
