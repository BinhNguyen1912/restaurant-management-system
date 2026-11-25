import { createZodDto } from 'nestjs-zod'
import {
  CashBookQuerySchema,
  CashBookResSchema,
  LedgerEntryListResSchema,
  LedgerEntryQuerySchema,
  LedgerIntegrityResSchema,
  LedgerReconciliationQuerySchema,
  LedgerReconciliationResSchema,
  SettleVnpayClearingSchema,
} from '@/routes/ledger-entry/ledger-entry.model'

export class LedgerEntryQueryDTO extends createZodDto(LedgerEntryQuerySchema) {}
export class LedgerEntryListResDTO extends createZodDto(LedgerEntryListResSchema) {}
export class LedgerIntegrityResDTO extends createZodDto(LedgerIntegrityResSchema) {}

export class LedgerReconciliationQueryDTO extends createZodDto(LedgerReconciliationQuerySchema) {}
export class LedgerReconciliationResDTO extends createZodDto(LedgerReconciliationResSchema) {}
export class SettleVnpayClearingDTO extends createZodDto(SettleVnpayClearingSchema) {}

export class CashBookQueryDTO extends createZodDto(CashBookQuerySchema) {}
export class CashBookResDTO extends createZodDto(CashBookResSchema) {}
