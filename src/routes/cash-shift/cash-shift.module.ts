import { Module } from '@nestjs/common'
import { CashShiftController } from '@/routes/cash-shift/cash-shift.controller'
import { CashShiftService } from '@/routes/cash-shift/cash-shift.service'
import { CashShiftRepo } from '@/routes/cash-shift/cash-shift.repo'

@Module({
  controllers: [CashShiftController],
  providers: [CashShiftService, CashShiftRepo],
})
export class CashShiftModule {}
