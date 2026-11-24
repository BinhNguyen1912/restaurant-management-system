import { createZodDto } from 'nestjs-zod'
import {
  CashMovementSchema,
  CashShiftDetailSchema,
  CashShiftListQuerySchema,
  CashShiftListResSchema,
  CashShiftParamSchema,
  CashShiftSchema,
  CloseCashShiftSchema,
  CreateCashMovementSchema,
  OpenCashShiftSchema,
} from '@/routes/cash-shift/cash-shift.model'

export class OpenCashShiftDTO extends createZodDto(OpenCashShiftSchema) {}
export class CloseCashShiftDTO extends createZodDto(CloseCashShiftSchema) {}
export class CreateCashMovementDTO extends createZodDto(CreateCashMovementSchema) {}
export class CashShiftParamDTO extends createZodDto(CashShiftParamSchema) {}
export class CashShiftListQueryDTO extends createZodDto(CashShiftListQuerySchema) {}
export class CashShiftResDTO extends createZodDto(CashShiftSchema) {}
export class CashShiftDetailResDTO extends createZodDto(CashShiftDetailSchema) {}
export class CashShiftListResDTO extends createZodDto(CashShiftListResSchema) {}
export class CashMovementResDTO extends createZodDto(CashMovementSchema) {}

