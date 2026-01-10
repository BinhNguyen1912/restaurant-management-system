import { Module } from '@nestjs/common'
import { TableLayoutService } from './table-layout.service'
import { TableLayoutController } from './table-layout.controller'
import { TableLayoutRepo } from '@/routes/table-layout/table-layout.repo'

@Module({
  controllers: [TableLayoutController],
  providers: [TableLayoutService, TableLayoutRepo],
})
export class TableLayoutModule {}
