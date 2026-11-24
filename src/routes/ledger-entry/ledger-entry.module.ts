import { Module } from '@nestjs/common'
import { LedgerEntryController } from '@/routes/ledger-entry/ledger-entry.controller'
import { LedgerEntryService } from '@/routes/ledger-entry/ledger-entry.service'
import { LedgerEntryRepo } from '@/routes/ledger-entry/ledger-entry.repo'

@Module({
  controllers: [LedgerEntryController],
  providers: [LedgerEntryService, LedgerEntryRepo],
})
export class LedgerEntryModule {}
