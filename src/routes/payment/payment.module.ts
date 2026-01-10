import { Module } from '@nestjs/common'
import { VnPayController } from './vnpay.controller'
import { PrismaService } from '@/shared/service/prisma.service'

@Module({
  controllers: [VnPayController],
  providers: [PrismaService],
  exports: [],
})
export class PaymentModule {}
