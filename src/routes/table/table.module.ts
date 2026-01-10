import { TableController } from '@/routes/table/table.controller'
import { TableRepo } from '@/routes/table/table.repo'
import { TableService } from '@/routes/table/table.service'
import { Module } from '@nestjs/common'

@Module({
  controllers: [TableController],
  providers: [TableRepo, TableService],
})
export class TableModule {}
