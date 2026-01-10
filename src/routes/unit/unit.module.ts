import { UnitController } from '@/routes/unit/unit.controller'
import { UnitRepo } from '@/routes/unit/unit.repo'
import { UnitService } from '@/routes/unit/unit.service'
import { Module } from '@nestjs/common'

@Module({
  controllers: [UnitController],
  providers: [UnitService, UnitRepo],
})
export class UnitModule {}
