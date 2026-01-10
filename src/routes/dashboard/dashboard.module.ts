import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { DashboardIndicatorService } from '@/routes/dashboard/dashboard-indicator.service'

@Module({
  controllers: [DashboardController],
  providers: [DashboardIndicatorService],
  exports: [DashboardIndicatorService],
})
export class DashboardModule {}
