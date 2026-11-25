import { createZodDto } from 'nestjs-zod'
import {
  RecomputeResSchema,
  RecomputeSchema,
  ReportRangeSchema,
  RevenueByItemResSchema,
  DashboardOverviewResSchema,
  RevenueReportResSchema,
} from '@/routes/reports/reports.model'

export class ReportRangeDTO extends createZodDto(ReportRangeSchema) {}
export class RecomputeDTO extends createZodDto(RecomputeSchema) {}
export class RevenueReportResDTO extends createZodDto(RevenueReportResSchema) {}
export class RevenueByItemResDTO extends createZodDto(RevenueByItemResSchema) {}
export class RecomputeResDTO extends createZodDto(RecomputeResSchema) {}

export class DashboardOverviewResDTO extends createZodDto(DashboardOverviewResSchema) {}
