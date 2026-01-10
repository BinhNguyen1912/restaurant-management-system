import { Module } from '@nestjs/common'
import { ReservationController } from './reservation.controller'
import { ReservationRepo } from './reservation.repo'
import { ReservationCustomerService } from './reservation-customer.service'
import { ReservationManageService } from './reservation-manage.service'
import { ReservationCustomerController } from './reservation-customer.controller'

@Module({
  controllers: [ReservationController, ReservationCustomerController],
  providers: [ReservationRepo, ReservationCustomerService, ReservationManageService],
})
export class ReservationModule {}
