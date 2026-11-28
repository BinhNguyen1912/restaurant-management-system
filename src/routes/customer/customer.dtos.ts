import { createZodDto } from 'nestjs-zod'
import {
  CustomerListQuerySchema,
  CustomerListResSchema,
  CustomerDetailResSchema,
  CustomerNoteBodySchema,
  CustomerNoteResSchema,
  CustomerOpenOrdersResSchema,
  CustomerPointsResSchema,
  CustomerRedeemPointsBodySchema,
  CustomerRedeemPointsResSchema,
  CustomerReportQuerySchema,
  CustomerReportResSchema,
} from '@/routes/customer/customer.model'

export class CustomerListQueryDTO extends createZodDto(CustomerListQuerySchema) {}
export class CustomerListResDTO extends createZodDto(CustomerListResSchema) {}
export class CustomerDetailResDTO extends createZodDto(CustomerDetailResSchema) {}
export class CustomerNoteBodyDTO extends createZodDto(CustomerNoteBodySchema) {}
export class CustomerNoteResDTO extends createZodDto(CustomerNoteResSchema) {}
export class CustomerOpenOrdersResDTO extends createZodDto(CustomerOpenOrdersResSchema) {}
export class CustomerPointsResDTO extends createZodDto(CustomerPointsResSchema) {}
export class CustomerRedeemPointsBodyDTO extends createZodDto(CustomerRedeemPointsBodySchema) {}
export class CustomerRedeemPointsResDTO extends createZodDto(CustomerRedeemPointsResSchema) {}
export class CustomerReportQueryDTO extends createZodDto(CustomerReportQuerySchema) {}
export class CustomerReportResDTO extends createZodDto(CustomerReportResSchema) {}
