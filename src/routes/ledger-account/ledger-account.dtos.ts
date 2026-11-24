import { createZodDto } from 'nestjs-zod'
import {
  CreateLedgerAccountSchema,
  GetLedgerAccountsResSchema,
  LedgerAccountParamSchema,
  LedgerAccountQuerySchema,
  UpdateLedgerAccountSchema,
} from '@/routes/ledger-account/ledger-account.model'

export class LedgerAccountQueryDTO extends createZodDto(LedgerAccountQuerySchema) {}
export class CreateLedgerAccountDTO extends createZodDto(CreateLedgerAccountSchema) {}
export class UpdateLedgerAccountDTO extends createZodDto(UpdateLedgerAccountSchema) {}
export class LedgerAccountParamDTO extends createZodDto(LedgerAccountParamSchema) {}
export class GetLedgerAccountsResDTO extends createZodDto(GetLedgerAccountsResSchema) {}
