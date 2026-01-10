import { PaginationQuerySchema } from '@/shared/models/request.model'
import { AreaSchema } from '@/shared/models/shared-area.model'
import z from 'zod'

export const areaBodySchema = AreaSchema.pick({
  name: true,
  isActive: true,
})
export const updateAreaBodySchema = areaBodySchema
export const getListAreaResSchema = z.object({
  data: z.array(AreaSchema),
  totalItems: z.number(),
  totalPages: z.number(),
  page: z.number(),
  limit: z.number(),
})
export const areaParamsSchema = z.object({
  id: z.coerce.number(),
})
export const getQueryAreaSchema = PaginationQuerySchema
export const areaResSchema = AreaSchema

export type AreaBodyType = z.infer<typeof areaBodySchema>
export type UpdateAreaBodyType = z.infer<typeof updateAreaBodySchema>
export type AreaParamsType = z.infer<typeof areaParamsSchema>
export type AreaResType = z.infer<typeof areaResSchema>
export type GetListAreaResType = z.infer<typeof getListAreaResSchema>
export type AreaQueryType = z.infer<typeof getQueryAreaSchema>
