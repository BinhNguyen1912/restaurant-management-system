import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { OrderStatus, PaymentStatus, TypeToOrderStatus } from '@/shared/constants/order.constant'
import { guestSchema } from '@/shared/models/shared-guest.model'
import { PaymentShema } from '@/shared/models/shared-payment.model'
import { ProductSchema, ProductSKUSnapshotSchema } from '@/shared/models/shared-product.model'
import { tableNodeSchema } from '@/shared/models/shared-tableNode.model'
import z from 'zod'

export const OrderQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(10),
  search: z.string().optional(),
  status: z
    .enum([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
      OrderStatus.READY,
      OrderStatus.PAID,
    ])
    .optional(),
  type: z.enum([TypeToOrderStatus.ONLINE, TypeToOrderStatus.AT_TABLE, TypeToOrderStatus.RESERVATION]).optional(),
  createdAt: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  updatedAt: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  tableNodeId: z.coerce.number().int().positive().optional(),
})
export const OrderItemSchema = z.object({
  id: z.number(),
  productName: z.string(),
  skuValue: z.string(),
  skuId: z.number(),
  orderId: z.number(),
  createdAt: z.string().transform((val) => new Date(val)),
  image: z.string(),
  productId: z.number(),
  productTranslations: z.array(z.any()),
  quantity: z.number(),
  skuPrice: moneyOutputSchema,
})

export const OrderGuestSchema = guestSchema.extend({
  tableNode: tableNodeSchema.nullable(),
})

export const OrderPaymentSchema = PaymentShema.pick({
  method: true,
  amount: true,
  status: true,
})

export const OrderTableNodeSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const OrderDetailSchema = z.object({
  id: z.number(),
  userId: z.number().nullable(),
  guestId: z.number().nullable(),
  reservationId: z.number().nullable(),
  paymentId: z.number(),
  tableNodeId: z.number().nullable(),
  status: z.enum([
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.PAID,
  ]),
  voucherSnapshotId: z.number().nullable(),
  type: z.enum([TypeToOrderStatus.ONLINE, TypeToOrderStatus.AT_TABLE, TypeToOrderStatus.RESERVATION]),
  receiver: z.any().nullable(),
  deletedAt: z.date().nullable(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z
    .object({
      name: z.string(),
      id: z.number(),
    })
    .nullable(),
  guest: guestSchema
    .omit({
      refreshToken: true,
      refreshTokenExpiresAt: true,
    })
    .nullable(),
  payment: OrderPaymentSchema,
  tableNode: OrderTableNodeSchema.nullable(),
  items: z.array(ProductSKUSnapshotSchema),
})

export const OrdersListResSchema = z.object({
  data: z.array(OrderDetailSchema),
  limit: z.number(),
  page: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
})

export const OrderIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const GuestIdParamSchema = z.object({
  guestId: z.coerce.number().int().positive(),
})

/**
 * Thu tiền các đơn đang mở của một khách.
 *
 * Trước đây là `GET /orders/pay-orders-by-guest/:guestId` — một endpoint GHI tiền nhưng khai báo
 * GET, nên bị prefetch/retry/crawler gọi hộ và không có body để ghi rõ phương thức thu. Chỉ nhận
 * `CASH`; VNPay đi qua luồng tạo URL thanh toán riêng (có webhook xác nhận).
 */
export const PayGuestOrdersSchema = z.object({
  method: z.enum(['CASH']).default('CASH'),
  /** ghi chú thu tiền (tuỳ chọn) — vào audit log */
  note: z.string().trim().max(255).optional(),
})
export type OrderQueryType = z.infer<typeof OrderQuerySchema>
export type OrderItemType = z.infer<typeof OrderItemSchema>
export type OrderGuestType = z.infer<typeof OrderGuestSchema>
export type OrderPaymentType = z.infer<typeof OrderPaymentSchema>
export type OrderTableNodeType = z.infer<typeof OrderTableNodeSchema>
export type OrderDetailType = z.infer<typeof OrderDetailSchema>
export type OrdersListResType = z.infer<typeof OrdersListResSchema>
export type OrderIdParamType = z.infer<typeof OrderIdParamSchema>
export type GuestIdParamType = z.infer<typeof GuestIdParamSchema>
export type PayGuestOrdersType = z.infer<typeof PayGuestOrdersSchema>
