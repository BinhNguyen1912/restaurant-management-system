import { createZodDto } from 'nestjs-zod'
import {
  RunDetailSchema,
  RunListSchema,
  RunQuerySchema,
  RunResSchema,
} from '@/routes/reconciliation/reconciliation.model'
import { z } from 'zod'

export class RunQueryDTO extends createZodDto(RunQuerySchema) {}
export class RunResDTO extends createZodDto(RunResSchema) {}
export class RunListDTO extends createZodDto(RunListSchema) {}
export class RunDetailDTO extends createZodDto(RunDetailSchema) {}
export class ResolveItemDTO extends createZodDto(
  z.object({ status: z.enum(['RESOLVED', 'IGNORED']) }),
) {}
