import {
  guestParamsRefeshTokenSchema,
  guestOrdersListSchema,
  guestOrdersQuerySchema,
  guestListQuerySchema,
  guestListSchema,
  callStaffSchema,
} from '@/routes/guest/guest.model'
import { CreateGuestSchema, guestLoginResSchema, guestLoginSchema } from '@/shared/models/shared-guest.model'
import { CreateNewOrderSchema } from '@/shared/models/shared-order.model'
import { createZodDto } from 'nestjs-zod'

export class GuestLoginBodyDTO extends createZodDto(guestLoginSchema) {}

export class GuestLoginResDTO extends createZodDto(guestLoginResSchema) {}

export class GuestParamsRefeshTokenDTO extends createZodDto(guestParamsRefeshTokenSchema) {}

export class GuestCreateNewOrderDTO extends createZodDto(CreateNewOrderSchema) {}

export class GuestOrdersQueryDTO extends createZodDto(guestOrdersQuerySchema) {}

export class GuestOrdersListDTO extends createZodDto(guestOrdersListSchema) {}

export class GuestListQueryDTO extends createZodDto(guestListQuerySchema) {}

export class GuestListDTO extends createZodDto(guestListSchema) {}

export class CreateGuestDTO extends createZodDto(CreateGuestSchema) {}

export class CallStaffDTO extends createZodDto(callStaffSchema) {}
