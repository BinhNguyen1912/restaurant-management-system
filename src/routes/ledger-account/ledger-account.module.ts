import { Module } from '@nestjs/common'
import { LedgerAccountController } from '@/routes/ledger-account/ledger-account.controller'
import { LedgerAccountService } from '@/routes/ledger-account/ledger-account.service'
import { LedgerAccountRepo } from '@/routes/ledger-account/ledger-account.repo'

@Module({
  controllers: [LedgerAccountController],
  providers: [LedgerAccountService, LedgerAccountRepo],
})
export class LedgerAccountModule {}
