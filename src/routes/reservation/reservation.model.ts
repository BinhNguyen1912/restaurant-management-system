import { reservationStatus } from '@/shared/constants/reservation.constant'
import { PaginationQuerySchema } from '@/shared/models/request.model'
import { OrderItemSchema } from '@/shared/models/shared-order.model'
import { ReservationSchema } from '@/shared/models/shared-reservation.model'
import z from 'zod'

export const reservationBodySchema = ReservationSchema.pick({
  customerName: true,
  customerPhone: true,
  tableNodeId: true,
  guestCount: true,
  depositAmount: true,
  depositPercent: true,
  reservationTime: true,
  note: true,
})
  .extend({
    hasPreOrder: z.boolean(),
    preOrderItems: z.array(OrderItemSchema),
  })
  .superRefine(({ depositAmount, hasPreOrder, depositPercent, preOrderItems }, cx) => {
    if (hasPreOrder == false && depositAmount && depositPercent) {
      cx.addIssue({
        code: 'custom',
        message: 'Trường depositAmount và depositPercent chỉ được phép nhập khi hasPreOrder = true',
      })
    }
    if (hasPreOrder == true && (!preOrderItems || preOrderItems.length === 0)) {
      cx.addIssue({
        code: 'custom',
        message: 'Phải có ít nhất 1 món trong preOrderItems khi hasPreOrder = true',
      })
    }
    if (hasPreOrder == true && depositPercent == 0 && depositAmount == 0) {
      cx.addIssue({
        code: 'custom',
        message: 'Cần phải thanh toán cọc trước khi đặt chỗ',
      })
    }
  })
export const reservationIncludeUrlVnpaySchema = z.object({
  reservation: ReservationSchema,
  urlVnPay: z.string(),
})

export const ReservationBaseQuerySchema = PaginationQuerySchema.extend({
  date: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  status: z
    .enum([
      reservationStatus.CANCELLED,
      reservationStatus.CHECKED_IN,
      reservationStatus.COMPLETED,
      reservationStatus.NO_SHOW,
      reservationStatus.CONFIRMED,
      reservationStatus.PENDING,
    ])
    .optional(),

  search: z.string().optional(),
})

export const StaffReservationQuerySchema = ReservationBaseQuerySchema.extend({
  userId: z.coerce.number().optional(),
  customerPhone: z.string().optional(),
  tableNodeId: z.coerce.number().optional(),
  includeSensitive: z.boolean().default(false),
})

export const ReservationQuerySchema = z.union([ReservationBaseQuerySchema, StaffReservationQuerySchema])

export const reservationQuerySchema = PaginationQuerySchema.extend({})
export const ReservationUnionSchema = z.union([ReservationSchema, reservationIncludeUrlVnpaySchema])
export type ReservationBodyType = z.infer<typeof reservationBodySchema>
export type ReservationIncludeUrlVnpayType = z.infer<typeof reservationIncludeUrlVnpaySchema>
export type ReservationBaseQueryType = z.infer<typeof ReservationBaseQuerySchema>
export type StaffReservationQueryType = z.infer<typeof StaffReservationQuerySchema>
export type ReservationQueryType = z.infer<typeof ReservationQuerySchema>
