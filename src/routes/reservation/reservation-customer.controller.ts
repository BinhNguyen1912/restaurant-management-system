import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  ReservationBodyDTO,
  ReservationCustomerQueryDTO,
  ReservationDTO,
  ReservationResIncludeUrlDTO,
} from './reservation.dtos'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { Request } from 'express'
import { ReservationUnionSchema } from './reservation.model'
import { ReservationCustomerService } from './reservation-customer.service'
import { AccessTokenPayload } from '@/shared/types/jwt.types'

@Controller('reservation/customer')
export class ReservationCustomerController {
  constructor(private readonly reservationCustomerService: ReservationCustomerService) {}

  @Post()
  @ZodSerializerDto(ReservationUnionSchema)
  async create(@Body() body: ReservationBodyDTO, @ActiveUser('userId') userId: number, @Req() req: Request) {
    return await this.reservationCustomerService.create({
      body,
      req,
      userId,
    })
  }
  @Get('listReservation')
  async getReservationCustomer(@Query() query: ReservationCustomerQueryDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.reservationCustomerService.list(query, user)
  }
}
