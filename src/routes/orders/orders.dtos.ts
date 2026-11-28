import {
  OrderQuerySchema,
  OrdersListResSchema,
  OrderDetailSchema,
  OrderIdParamSchema,
  GuestIdParamSchema,
  PayGuestOrdersSchema,
} from '@/routes/orders/orders.model'
import { UpdateOrderResSchema, UpdateOrderSchema } from '@/shared/models/shared-order.model'
import { createZodDto } from 'nestjs-zod'

export class ListOrdersDTO extends createZodDto(OrderQuerySchema) {}
export class OrdersListResDTO extends createZodDto(OrdersListResSchema) {}
export class OrderDetailResDTO extends createZodDto(OrderDetailSchema) {}
export class UpdateOrderDTO extends createZodDto(UpdateOrderSchema) {}
export class UpdateOrderResDTO extends createZodDto(UpdateOrderResSchema) {}
export class OrderIdParamDTO extends createZodDto(OrderIdParamSchema) {}
export class GuestIdParamDTO extends createZodDto(GuestIdParamSchema) {}
export class PayGuestOrdersDTO extends createZodDto(PayGuestOrdersSchema) {}
