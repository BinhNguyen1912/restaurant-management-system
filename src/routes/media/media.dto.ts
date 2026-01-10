import { createZodDto } from 'nestjs-zod'
import { MediaResSchema } from './media.model'

export class MediaResDTO extends createZodDto(MediaResSchema) {}
