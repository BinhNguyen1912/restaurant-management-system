import { PaginationQuerySchema } from '@/shared/models/request.model'
import { tableLayoutSchema } from '@/shared/models/shared-tableLayout.model'
import z from 'zod'

export const tableLayoutBodySchema = tableLayoutSchema.pick({
  name: true,
  areaId: true,
  status: true,
})
export const updateTableLayoutBodySchema = tableLayoutBodySchema
export const getListTableLayoutResSchema = z.object({
  data: z.array(
    tableLayoutSchema.extend({
      area: z.object({ name: z.string() }),
    }),
  ),
  totalItems: z.number(),
  totalPages: z.number(),
  page: z.number(),
  limit: z.number(),
})
export const TableLayoutParamsSchema = z.object({
  id: z.coerce.number(),
})
export const getQueryTableLayoutSchema = PaginationQuerySchema
export const TableLayoutResSchema = tableLayoutSchema
export const TableLayoutDetailResSchema = TableLayoutResSchema.extend({
  area: z.object({ name: z.string() }),
})
export type TableLayoutBodyType = z.infer<typeof tableLayoutBodySchema>
export type UpdateTableLayoutBodyType = z.infer<typeof updateTableLayoutBodySchema>
export type TableLayoutParamsType = z.infer<typeof TableLayoutParamsSchema>
export type TableLayoutResType = z.infer<typeof TableLayoutResSchema>
export type GetListTableLayoutResType = z.infer<typeof getListTableLayoutResSchema>
export type TableLayoutQueryType = z.infer<typeof getQueryTableLayoutSchema>
