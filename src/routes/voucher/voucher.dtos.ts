import { createZodDto } from 'nestjs-zod'
import {
  VoucherBodySchema,
  VoucherDetailResSchema,
  VoucherListResSchema,
  VoucherQuerySchema,
  VoucherStatusBodySchema,
} from '@/routes/voucher/voucher.model'

export class VoucherBodyDTO extends createZodDto(VoucherBodySchema) {}
export class VoucherQueryDTO extends createZodDto(VoucherQuerySchema) {}
export class VoucherListResDTO extends createZodDto(VoucherListResSchema) {}
export class VoucherDetailResDTO extends createZodDto(VoucherDetailResSchema) {}
export class VoucherStatusBodyDTO extends createZodDto(VoucherStatusBodySchema) {}
