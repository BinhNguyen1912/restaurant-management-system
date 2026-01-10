import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import {
  DashboardIndicatorQuerySchema,
  DashboardIndicatorResponseSchema,
  ProductIndicatorSchema,
  RevenueByDateSchema,
} from '@/routes/dashboard/dashboard.model'

export class DashboardIndicatorQueryDTO extends createZodDto(DashboardIndicatorQuerySchema) {}
export class DashboardIndicatorResponseDTO extends createZodDto(DashboardIndicatorResponseSchema) {}

export type DashboardIndicatorQueryType = z.infer<typeof DashboardIndicatorQuerySchema>
export type DashboardIndicatorResponseType = z.infer<typeof DashboardIndicatorResponseSchema>
export type ProductIndicatorType = z.infer<typeof ProductIndicatorSchema>
export type RevenueByDateType = z.infer<typeof RevenueByDateSchema>
