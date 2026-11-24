import { Module } from '@nestjs/common'
import { HealthController } from '@/routes/health/health.controller'

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
