import { createZodDto } from 'nestjs-zod'
import {
  ReservationBaseQuerySchema,
  reservationBodySchema,
  reservationIncludeUrlVnpaySchema,
  ReservationUnionSchema,
} from './reservation.model'
import { ReservationSchema } from '@/shared/models/shared-reservation.model'

export class ReservationBodyDTO extends createZodDto(reservationBodySchema) {}
export class ReservationDTO extends createZodDto(ReservationSchema) {}
export class ReservationResIncludeUrlDTO extends createZodDto(reservationIncludeUrlVnpaySchema) {}
export class ReservationCustomerQueryDTO extends createZodDto(ReservationBaseQuerySchema) {}
