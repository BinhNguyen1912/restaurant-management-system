import z from 'zod'
import { reservationStatus } from '../constants/reservation.constant'
import { UserSchema } from './shared-user.model'
import { OrderSchema } from './shared-order.model'
import { ProductSchema, ProductSKUSnapshotSchema } from './shared-product.model'
import { tableNodeSchema } from './shared-tableNode.model'
import { AreaSchema } from './shared-area.model'

export const ReservationSchema = z.object({
  id: z.number(),
  userId: z.number(),
  customerName: z.string(),
  customerPhone: z.string(),
  guestCount: z.number(),
  check_in_time: z.date().nullable(),
  reservationTime: z.coerce.date().superRefine((data, ctx) => {
    const now = new Date()

    if (new Date(data) < now) {
      ctx.addIssue({
        code: 'custom',
        message: 'Thời gian đặt bàn phải lớn hơn thời điểm hiện tại',
      })
    }
  }),

  hasPreOrder: z.boolean().nullable(),
  tableNodeId: z.number(),
  note: z.string().nullable(),
  status: z.enum([
    reservationStatus.CANCELLED,
    reservationStatus.CHECKED_IN,
    reservationStatus.COMPLETED,
    reservationStatus.CONFIRMED,
    reservationStatus.NO_SHOW,
    reservationStatus.PENDING,
    reservationStatus.DEPOSITED,
  ]),
  depositAmount: z.number().nullable(),
  depositPercent: z.number().nullable(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})

export const GetReservationDetailResShema = ReservationSchema.extend({
  user: UserSchema.pick({
    name: true,
    id: true,
    avatar: true,
    email: true,
  }),
  orders: z.array(
    OrderSchema.extend({
      items: z.array(ProductSKUSnapshotSchema),
      products: z.array(
        ProductSchema.pick({
          name: true,
        }),
      ),
    }),
  ),
  tableNode: tableNodeSchema
    .pick({
      name: true,
      id: true,
      seats: true,
      status: true,
    })
    .extend({
      area: AreaSchema.pick({
        name: true,
      }),
    })
    .nullable(),
})
export type ReservationType = z.infer<typeof ReservationSchema>
export type GetReservationDetailResType = z.infer<typeof GetReservationDetailResShema>
