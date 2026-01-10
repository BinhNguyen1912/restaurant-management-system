import { createZodDto } from 'nestjs-zod'
import { markAsReadSchema, sendGuestMessageSchema, sendAdminToGuestMessageSchema } from './message.model'

export class SendGuestMessageDTO extends createZodDto(sendGuestMessageSchema) {}
export class MarkAsReadDTO extends createZodDto(markAsReadSchema) {}
export class SendAdminToGuestMessageDTO extends createZodDto(sendAdminToGuestMessageSchema) {}
