import { Module } from '@nestjs/common'
import { ReportsController } from '@/routes/reports/reports.controller'
import { ReportsService } from '@/routes/reports/reports.service'
import { ReportsRepo } from '@/routes/reports/reports.repo'

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepo],
  exports: [ReportsService],
})
export class ReportsModule {}
