import { createZodDto } from 'nestjs-zod'
import {
  VoucherBodySchema,
  VoucherListResSchema,
  VoucherQuerySchema,
  VoucherResSchema,
  VoucherStatusBodySchema,
} from '@/routes/voucher/voucher.model'

export class VoucherBodyDTO extends createZodDto(VoucherBodySchema) {}
export class VoucherQueryDTO extends createZodDto(VoucherQuerySchema) {}
export class VoucherResDTO extends createZodDto(VoucherResSchema) {}
export class VoucherListResDTO extends createZodDto(VoucherListResSchema) {}
export class VoucherStatusBodyDTO extends createZodDto(VoucherStatusBodySchema) {}
