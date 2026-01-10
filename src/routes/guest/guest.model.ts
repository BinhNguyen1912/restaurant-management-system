import { OrderStatus, PaymentStatus, TypeToOrderStatus } from '@/shared/constants/order.constant'
import { roleName } from '@/shared/constants/role.constant'
import { guestSchema } from '@/shared/models/shared-guest.model'
import { tableNodeSchema } from '@/shared/models/shared-tableNode.model'
import { create } from 'domain'
import { access } from 'fs'
import z from 'zod'

export const guestParamsSchema = z.object({
  id: z.coerce.number(),
})
export const guestParamsRefeshTokenSchema = z.object({
  refreshToken: z.string(),
})

export const guestCreateOrderBody = z.array(
  z.object({
    skuId: z.number(),
    quality: z.number(),
  }),
)

export const guestOrderItemSchema = z.object({
  id: z.number(),
  createdAt: z.coerce.date(),
  productName: z.string(),
  skuValue: z.string(),
  skuId: z.number(),
  orderId: z.number().nullable(),
  image: z.string(),
  productId: z.number().nullable(),
  productTranslations: z.any(),
  quantity: z.number(),
  skuPrice: z.number(),
})

export const guestOrderSchema = z.object({
  id: z.number(),
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
  type: z.enum([TypeToOrderStatus.AT_TABLE, TypeToOrderStatus.ONLINE, TypeToOrderStatus.RESERVATION]),
  deletedAt: z.date().nullable(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  payment: z.object({
    method: z.string().nullable(),
    amount: z.string(),
    status: z.enum([PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.PENDING]),
  }),
  items: z.array(guestOrderItemSchema),
})

export const guestOrdersListSchema = z.object({
  data: z.array(guestOrderSchema),
  limit: z.number(),
  page: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
})

export const guestOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
  status: z
    .enum([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
      OrderStatus.PAID,
    ])
    .optional(),
})

export const guestListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
})

export const guestListSchema = z.object({
  data: z.array(
    guestSchema
      .extend({
        tableNode: tableNodeSchema.nullable(),
      })
      .omit({
        refreshToken: true,
        refreshTokenExpiresAt: true,
      }),
  ),
  limit: z.number(),
  page: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
})
export const callStaffSchema = z.object({
  tableNode: z.object({
    id: z.number(),
    name: z.string(),
  }),
})
export type GuestCreateOrderType = z.infer<typeof guestCreateOrderBody>
export type GuestOrderItemType = z.infer<typeof guestOrderItemSchema>
export type GuestOrderType = z.infer<typeof guestOrderSchema>
export type GuestOrdersListType = z.infer<typeof guestOrdersListSchema>
export type GuestOrdersQueryType = z.infer<typeof guestOrdersQuerySchema>
export type GuestListQueryType = z.infer<typeof guestListQuerySchema>
export type GuestListType = z.infer<typeof guestListSchema>
export type CallStaffType = z.infer<typeof callStaffSchema>
