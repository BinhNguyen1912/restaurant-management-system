import { Module } from '@nestjs/common'
import { LedgerEntryController } from '@/routes/ledger-entry/ledger-entry.controller'
import { LedgerEntryService } from '@/routes/ledger-entry/ledger-entry.service'
import { LedgerEntryRepo, LedgerReconciliationRepo } from '@/routes/ledger-entry/ledger-entry.repo'

@Module({
  controllers: [LedgerEntryController],
  providers: [LedgerEntryService, LedgerEntryRepo, LedgerReconciliationRepo],
})
export class LedgerEntryModule {}
