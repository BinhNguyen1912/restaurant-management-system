import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { OrderStatus, TypeToOrderStatus } from '@/shared/constants/order.constant'
import { guestSchema } from '@/shared/models/shared-guest.model'
import { ProductSchema, ProductSKUSnapshotSchema } from '@/shared/models/shared-product.model'
import z from 'zod'
import { UserSchema } from './shared-user.model'

export const OrderSchema = z.object({
  id: z.number(),
  tableNodeId: z.number().nullable(),
  paymentId: z.number(),
  userId: z.number().nullable(),
  guestId: z.number().nullable(),
  reservationId: z.number().nullable(),
  status: z.enum([
    OrderStatus.PENDING,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.PAID,
  ]),
  voucherSnapshotId: z.number().nullable(),
  type: z.enum([TypeToOrderStatus.AT_TABLE, TypeToOrderStatus.ONLINE, TypeToOrderStatus.RESERVATION]),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const OrderItemSchema = z
  .object({
    skuId: z.coerce.number(),
    quantity: z.coerce.number().optional(),
  })
  .transform((val) => ({
    skuId: val.skuId,
    quantity: val.quantity ?? val.quantity ?? 0,
  }))

export const OrderResSchema = OrderSchema.extend({
  items: z.array(
    z.object({
      id: z.number(),
      skuValue: z.string(),
      image: z.string(),
      productName: z.string(),
      quantity: z.number(),
      skuPrice: moneyOutputSchema,
      productTranslations: z.any().optional(),
      product: ProductSchema.extend({
        productSKUSnapshots: z.array(ProductSKUSnapshotSchema),
      }).nullable(),
    }),
  ),
  guest: guestSchema
    .omit({
      refreshToken: true,
      refreshTokenExpiresAt: true,
    })
    .nullable()
    .optional(),
  user: UserSchema.omit({
    totpSecret: true,
  })
    .nullable()
    .optional(),
  tableNode: z
    .object({
      name: z.string(),
    })
    .nullable(),
})
export const CreateNewOrderSchema = z.array(OrderItemSchema)

export const UpdateOrderSchema = z.object({
  status: z.enum([
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.PAID,
  ]),
  quantity: z.number(),
  skuId: z.number(),
})
export const UpdateOrderResSchema = z.object({
  order: OrderResSchema,
  socketId: z.string(),
})
export type OrderType = z.infer<typeof OrderSchema>
export type OrderResType = z.infer<typeof OrderResSchema>
// export type GuestCreateNewOrder = z.infer<typeof GuestCreateNewOrderSchema>
// export type GuestCreateNewOrderType = GuestCreateNewOrder
export type CreateNewOrderType = z.infer<typeof CreateNewOrderSchema>
export type UpdateOrderType = z.infer<typeof UpdateOrderSchema>
export type UpdateOrderResType = z.infer<typeof UpdateOrderResSchema>
