import { OrderPaymentSchema } from '@/routes/orders/orders.model'
import { guestSchema } from '@/shared/models/shared-guest.model'
import { OrderSchema } from '@/shared/models/shared-order.model'
import { PaymentShema } from '@/shared/models/shared-payment.model'
import { ProductSKUSnapshotSchema } from '@/shared/models/shared-product.model'
import { z } from 'zod'

export const CreatePaymentUrlSchema = z.object({
  guestId: z.number().int().positive(),
})

export const QueryTransactionSchema = z.object({
  orderId: z.string(),
  transDate: z.string(),
})
export const OrderResForPaymentSchema = OrderSchema.extend({
  payment: PaymentShema,
  items: ProductSKUSnapshotSchema.array(),
  guest: guestSchema.nullable(),
})
export type CreatePaymentUrlType = z.infer<typeof CreatePaymentUrlSchema>
export type QueryTransactionType = z.infer<typeof QueryTransactionSchema>
export type OrderResForPaymentType = z.infer<typeof OrderResForPaymentSchema>
