import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller'
import { OrdersService } from '@/routes/orders/orders.service'
import { BullModule } from '@nestjs/bullmq'
import { AppGateway } from '@/webSockets/app.gateway'
import { WebSocketsModule } from '@/webSockets/websockets.module'
import { Inventory_Queue } from '@/shared/constants/others.constant'
import { OrdersRepo } from '@/routes/orders/orders.repo'

@Module({
  imports: [BullModule.registerQueue({ name: Inventory_Queue }), WebSocketsModule],
  controllers: [OrdersController],
  providers: [OrdersService, AppGateway, OrdersRepo],
})
export class OrdersModule {}
