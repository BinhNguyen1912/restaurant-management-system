import {
  CreateTableBodySchema,
  TableDetailResSchema,
  TableListResSchema,
  TableParamsSchema,
  UpdateTableBodySchema,
} from '@/routes/table/table.model'
import { createZodDto } from 'nestjs-zod'

export class CreateTableBodyDTO extends createZodDto(CreateTableBodySchema) {}

export class TableParamsDTO extends createZodDto(TableParamsSchema) {}

export class UpdateTableBodyDTO extends createZodDto(UpdateTableBodySchema) {}

export class TableDetailResDTO extends createZodDto(TableDetailResSchema) {}

export class TableListResDTO extends createZodDto(TableListResSchema) {}
