import { Module } from '@nestjs/common'
import { TableNodeService } from './table-node.service'
import { TableNodeController } from './table-node.controller'
import { TableNodeRepo } from '@/routes/table-node/table-node.repo'

@Module({
  controllers: [TableNodeController],
  providers: [TableNodeService, TableNodeRepo],
})
export class TableNodeModule {}
