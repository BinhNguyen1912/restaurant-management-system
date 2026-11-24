import { Module } from '@nestjs/common'
import { ReconciliationController } from '@/routes/reconciliation/reconciliation.controller'
import { ReconciliationService } from '@/routes/reconciliation/reconciliation.service'

@Module({
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
