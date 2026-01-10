import { PaginationQuerySchema } from '@/shared/models/request.model'
import { createZodDto } from 'nestjs-zod'

export class PagitionQueryDTO extends createZodDto(PaginationQuerySchema) {}
