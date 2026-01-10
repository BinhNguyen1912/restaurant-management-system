import { CreateReminderSchema } from '@/routes/reminders/reminders.model'
import { createZodDto } from 'nestjs-zod'

export class CreateReminderDTO extends createZodDto(CreateReminderSchema) {}
export class UpdateReminderDTO extends createZodDto(CreateReminderSchema) {}
export class ReminderQueryDTO extends createZodDto(CreateReminderSchema) {}
export class ReminderResDTO extends createZodDto(CreateReminderSchema) {}
