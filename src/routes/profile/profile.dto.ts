import { ChangePassWordBodySchema, UpdateMeBodySchema } from '@/routes/profile/profile.model'
import { createZodDto } from 'nestjs-zod'

export class updateMeBodyDTO extends createZodDto(UpdateMeBodySchema) {}
export class ChangePassWordBodyDTO extends createZodDto(ChangePassWordBodySchema) {}
