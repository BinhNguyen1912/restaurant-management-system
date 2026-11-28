import { reservationStatus } from '@/shared/constants/reservation.constant'
import { PaginationQuerySchema } from '@/shared/models/request.model'
import { OrderItemSchema } from '@/shared/models/shared-order.model'
import { ReservationSchema } from '@/shared/models/shared-reservation.model'
import { isAllowedDepositPercent } from '@/shared/service/deposit-policy'
import z from 'zod'

export const reservationBodySchema = ReservationSchema.pick({
  customerName: true,
  customerPhone: true,
  tableNodeId: true,
  guestCount: true,
  depositPercent: true,
  reservationTime: true,
  note: true,
}).extend({
  /**
   * Khách có đồng ý nhận ưu đãi không, hỏi lúc đặt bàn (NĐ 13/2023 — đồng ý theo từng mục đích).
   *
   * KHÔNG gửi = chưa hỏi khách ⇒ không ghi gì. `false` cũng là thông tin phải lưu: đừng hỏi lại
   * mỗi lần khách đặt bàn.
   */
  marketingConsent: z.boolean().optional(),
})
  .extend({
    hasPreOrder: z.boolean(),
    preOrderItems: z.array(OrderItemSchema),
  })
  // Tiền cọc server luôn tự tính từ depositPercent; client không gửi depositAmount, nên số tiền
  // không thể đi vòng qua Payment.amount và bút toán quyết toán cọc.
  .superRefine(({ hasPreOrder, depositPercent, preOrderItems }, cx) => {
    if (hasPreOrder == false && depositPercent != null && depositPercent !== 0) {
      cx.addIssue({
        code: 'custom',
        message: 'Chỉ được phép nhập depositPercent khi hasPreOrder = true',
      })
    }
    if (hasPreOrder == true && (!preOrderItems || preOrderItems.length === 0)) {
      cx.addIssue({
        code: 'custom',
        message: 'Phải có ít nhất 1 món trong preOrderItems khi hasPreOrder = true',
      })
    }
    if (hasPreOrder == true && !isAllowedDepositPercent(depositPercent)) {
      cx.addIssue({
        code: 'custom',
        message: 'Cần phải thanh toán cọc trước khi đặt chỗ: depositPercent phải là 30, 50, 70 hoặc 100%',
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
