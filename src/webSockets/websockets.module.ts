import { AppGateway } from '@/webSockets/app.gateway'
import { Module } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { WebSocketRepo } from '@/shared/shared-repository/shared-webSocket'
import { MessageRepo } from '@/routes/messages/message.repo'

@Module({
  providers: [AppGateway, PrismaService, WebSocketRepo, MessageRepo],
  exports: [AppGateway],
})
export class WebSocketsModule {}
