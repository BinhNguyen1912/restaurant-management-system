import { PaymentStatus } from '@/shared/constants/order.constant'
import { Decimal } from '@prisma/client/runtime/library'
import z from 'zod'

export const PaymentShema = z.object({
  id: z.number(),
  amount: z.instanceof(Decimal),
  method: z.string().nullable(),
  status: z.enum([PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.PENDING]),
  transactionId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type PaymentType = z.infer<typeof PaymentShema>
