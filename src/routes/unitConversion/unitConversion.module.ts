import { UnitConversionController } from '@/routes/unitConversion/unitConversion.controller'
import { UnitConversionRepo } from '@/routes/unitConversion/unitConversion.repo'
import { UnitConversionService } from '@/routes/unitConversion/unitConversion.service'
import { Module } from '@nestjs/common'

@Module({
  controllers: [UnitConversionController],
  providers: [UnitConversionService, UnitConversionRepo],
})
export class UnitConversionModule {}
