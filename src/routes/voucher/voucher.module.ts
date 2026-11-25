import { Module } from '@nestjs/common'
import { VoucherController } from '@/routes/voucher/voucher.controller'
import { VoucherService } from '@/routes/voucher/voucher.service'
import { VoucherRepo } from '@/routes/voucher/voucher.repo'

@Module({
  controllers: [VoucherController],
  providers: [VoucherService, VoucherRepo],
})
export class VoucherModule {}
