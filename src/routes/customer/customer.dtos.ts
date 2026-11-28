import { createZodDto } from 'nestjs-zod'
import {
  CustomerListQuerySchema,
  CustomerListResSchema,
  CustomerDetailResSchema,
  CustomerNoteBodySchema,
  CustomerNoteResSchema,
  CustomerReportQuerySchema,
  CustomerReportResSchema,
} from '@/routes/customer/customer.model'

export class CustomerListQueryDTO extends createZodDto(CustomerListQuerySchema) {}
export class CustomerListResDTO extends createZodDto(CustomerListResSchema) {}
export class CustomerDetailResDTO extends createZodDto(CustomerDetailResSchema) {}
export class CustomerNoteBodyDTO extends createZodDto(CustomerNoteBodySchema) {}
export class CustomerNoteResDTO extends createZodDto(CustomerNoteResSchema) {}
export class CustomerReportQueryDTO extends createZodDto(CustomerReportQuerySchema) {}
export class CustomerReportResDTO extends createZodDto(CustomerReportResSchema) {}
