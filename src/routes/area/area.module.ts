import { Module } from '@nestjs/common'
import { AreaService } from './area.service'
import { AreaController } from './area.controller'
import { AreaRepo } from '@/routes/area/area.repo'

@Module({
  controllers: [AreaController],
  providers: [AreaService, AreaRepo],
})
export class AreaModule {}
