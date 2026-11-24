import { PaymentMethod, PaymentStatus } from '@/shared/constants/order.constant'
import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import z from 'zod'

export const PaymentShema = z.object({
  id: z.number(),
  amount: moneyOutputSchema,
  method: z
    .enum([PaymentMethod.CASH, PaymentMethod.VNPAY, PaymentMethod.CARD, PaymentMethod.TRANSFER])
    .nullable(),
  gatewayCode: z.string().nullable().optional(),
  status: z.enum([
    PaymentStatus.SUCCESS,
    PaymentStatus.FAILED,
    PaymentStatus.PENDING,
    PaymentStatus.REFUNDED,
    PaymentStatus.PARTIALLY_REFUNDED,
  ]),
  transactionId: z.string().nullable(),
  currency: z.string().optional(),
  paidAt: z.date().nullable().optional(),
  refundedAmount: moneyOutputSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type PaymentType = z.infer<typeof PaymentShema>
