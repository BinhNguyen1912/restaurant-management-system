import { GuestController } from '@/routes/guest/guest.controller'
import { GuestRepo } from '@/routes/guest/guest.repo'
import { GuestService } from '@/routes/guest/guest.service'
import { Module } from '@nestjs/common'
import { AppGateway } from '@/webSockets/app.gateway'

@Module({
  controllers: [GuestController],
  providers: [GuestRepo, GuestService, AppGateway],
})
export class GuestModule {}
