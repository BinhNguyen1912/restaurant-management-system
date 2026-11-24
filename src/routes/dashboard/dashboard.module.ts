import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { DashboardIndicatorService } from '@/routes/dashboard/dashboard-indicator.service'
import { ReportsModule } from '@/routes/reports/reports.module'

@Module({
  imports: [ReportsModule],
  controllers: [DashboardController],
  providers: [DashboardIndicatorService],
  exports: [DashboardIndicatorService],
})
export class DashboardModule {}
