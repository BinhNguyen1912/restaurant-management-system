import {
  getListTableNodeResSchema,
  getQueryTableNodeSchema,
  tableNodeBodySchema,
  TableNodeParamsSchema,
  updateTableNodeBodyBatchResSchema,
  updateTableNodeBodyBatchSchema,
  updateTableNodeBodySchema,
} from '@/routes/table-node/table-node.model'
import { TableNodeDetailResSchema, TableNodeResSchema } from '@/shared/models/shared-tableNode.model'
import { createZodDto } from 'nestjs-zod'

export class TableNodeBodyDTO extends createZodDto(tableNodeBodySchema) {}

export class UpdateTableNodeBodyDTO extends createZodDto(updateTableNodeBodySchema) {}

export class TableNodeParamsDTO extends createZodDto(TableNodeParamsSchema) {}

export class ListTableNodeResDTO extends createZodDto(getListTableNodeResSchema) {}

export class TableNodeResDTO extends createZodDto(TableNodeResSchema) {}

export class TableNodeQueryDTO extends createZodDto(getQueryTableNodeSchema) {}

export class TableNodeDetailResDTO extends createZodDto(TableNodeDetailResSchema) {}

export class UpdateTableNodeBodyBatchDTO extends createZodDto(updateTableNodeBodyBatchSchema) {}

export class UpdateTableNodeBodyBatchResDTO extends createZodDto(updateTableNodeBodyBatchResSchema) {}
