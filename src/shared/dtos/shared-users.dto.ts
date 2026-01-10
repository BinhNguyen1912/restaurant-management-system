import { CreateGuestSchema, guestSchema } from '@/shared/models/shared-guest.model'
import { getProfileDetailResSchema, UpdateProfileResSchema } from '@/shared/models/shared-user.model'
import { createZodDto } from 'nestjs-zod'

export class GetProfileDetailResDTO extends createZodDto(getProfileDetailResSchema) {}
export class UpdateProfileResDTO extends createZodDto(UpdateProfileResSchema) {}
export class CreateGuestDTO extends createZodDto(CreateGuestSchema) {}
export class CreateGuestResDTO extends createZodDto(guestSchema) {}
