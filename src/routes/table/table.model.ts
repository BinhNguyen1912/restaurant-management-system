import { TableStatusValues } from '@/shared/constants/table.constant'
import { TableSchema } from '@/shared/models/shared-table.model'
import z from 'zod'

export const CreateTableBodySchema = z.object({
  number: z.coerce.number().positive(),
  capacity: z.coerce.number().positive(),
  status: z.enum(TableStatusValues).optional(),
})

export const TableDetailResSchema = z.object({
  message: z.string(),
  data: TableSchema,
})

export const TableListResSchema = z.object({
  data: z.array(TableSchema),
  message: z.string(),
})

export const UpdateTableBodySchema = z.object({
  changeToken: z.boolean(),
  capacity: z.coerce.number().positive(),
  status: z.enum(TableStatusValues).optional(),
})

export const TableParamsSchema = z.object({
  number: z.coerce.number(),
})

export type TableParamsType = z.TypeOf<typeof TableParamsSchema>
export type CreateTableBodyType = z.TypeOf<typeof CreateTableBodySchema>
export type TableDetailResType = z.TypeOf<typeof TableDetailResSchema>
export type TableListResType = z.TypeOf<typeof TableListResSchema>
export type UpdateTableBodyType = z.TypeOf<typeof UpdateTableBodySchema>
