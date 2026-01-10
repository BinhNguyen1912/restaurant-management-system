import { EmptyBodySchema } from '@/shared/models/request.model'
import { MessageResSchema } from '@/shared/models/respone.model'
import { createZodDto } from 'nestjs-zod'

export class MessageResDto extends createZodDto(MessageResSchema) {}
export class EmptyBodyDTO extends createZodDto(EmptyBodySchema) {}
