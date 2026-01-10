import {
  getListTableLayoutResSchema,
  getQueryTableLayoutSchema,
  tableLayoutBodySchema,
  TableLayoutDetailResSchema,
  TableLayoutParamsSchema,
  TableLayoutResSchema,
  updateTableLayoutBodySchema,
} from '@/routes/table-layout/table-layout.model'
import { createZodDto } from 'nestjs-zod'

export class TableLayoutBodyDTO extends createZodDto(tableLayoutBodySchema) {}

export class UpdateTableLayoutBodyDTO extends createZodDto(updateTableLayoutBodySchema) {}

export class TableLayoutParamsDTO extends createZodDto(TableLayoutParamsSchema) {}

export class ListTableLayoutResDTO extends createZodDto(getListTableLayoutResSchema) {}

export class TableLayoutResDTO extends createZodDto(TableLayoutResSchema) {}

export class TableLayoutQueryDTO extends createZodDto(getQueryTableLayoutSchema) {}

export class TableLayoutDetailResDTO extends createZodDto(TableLayoutDetailResSchema) {}
