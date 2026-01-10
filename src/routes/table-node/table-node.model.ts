import { PaginationQuerySchema } from '@/shared/models/request.model'
import { AreaSchema } from '@/shared/models/shared-area.model'
import { tableLayoutSchema } from '@/shared/models/shared-tableLayout.model'
import { TableNodeResSchema, tableNodeSchema } from '@/shared/models/shared-tableNode.model'
import z from 'zod'

export const tableNodeBodySchema = tableNodeSchema.pick({
  name: true,
  areaId: true,
  status: true,
  imageUrl: true,
  layoutId: true,
  positionX: true,
  height: true,
  width: true,
  positionY: true,
  rotation: true,
  seats: true,
  type: true,
})
export const updateTableNodeBodySchema = tableNodeBodySchema.extend({
  changeToken: z.boolean(),
})
export const updateTableNodeBodyBatchSchema = z.array(
  updateTableNodeBodySchema.extend({
    id: z.coerce.number(),
  }),
)
export const getListTableNodeResSchema = z.object({
  data: z.array(
    tableNodeSchema.extend({
      area: AreaSchema.pick({
        name: true,
      }),
      layout: tableLayoutSchema
        .pick({
          name: true,
          status: true,
        })
        .nullable(),
    }),
  ),
  totalItems: z.number(),
  totalPages: z.number(),
  page: z.number(),
  limit: z.number(),
})
export const TableNodeParamsSchema = z.object({
  id: z.coerce.number(),
})
export const getQueryTableNodeSchema = PaginationQuerySchema.extend({
  areaId: z.coerce.number().optional(),
})
export const updateTableNodeBodyBatchResSchema = z.object({
  data: z.array(TableNodeResSchema),
})

export type TableNodeBodyType = z.infer<typeof tableNodeBodySchema>
export type UpdateTableNodeBodyType = z.infer<typeof updateTableNodeBodySchema>
export type TableNodeParamsType = z.infer<typeof TableNodeParamsSchema>
export type GetListTableNodeResType = z.infer<typeof getListTableNodeResSchema>
export type TableNodeQueryType = z.infer<typeof getQueryTableNodeSchema>
export type UpdateTableNodeBodyBatchType = z.infer<typeof updateTableNodeBodyBatchSchema>
export type UpdateTableNodeBodyBatchResType = z.infer<typeof updateTableNodeBodyBatchResSchema>
