import { createZodDto } from 'nestjs-zod'
import {
  LedgerEntryListResSchema,
  LedgerEntryQuerySchema,
  LedgerIntegrityResSchema,
} from '@/routes/ledger-entry/ledger-entry.model'

export class LedgerEntryQueryDTO extends createZodDto(LedgerEntryQuerySchema) {}
export class LedgerEntryListResDTO extends createZodDto(LedgerEntryListResSchema) {}
export class LedgerIntegrityResDTO extends createZodDto(LedgerIntegrityResSchema) {}
