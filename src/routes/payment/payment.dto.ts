import { CreatePaymentUrlSchema, QueryTransactionSchema } from '@/routes/payment/payment.model'
import { createZodDto } from 'nestjs-zod'

export class CreatePaymentUrlDTO extends createZodDto(CreatePaymentUrlSchema) {}
export class QueryTransactionDTO extends createZodDto(QueryTransactionSchema) {}
