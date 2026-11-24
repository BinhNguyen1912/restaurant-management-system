import { createZodDto } from 'nestjs-zod'
import { AuditLogQuerySchema, AuditLogResSchema } from '@/routes/audit-log/audit-log.model'

export class AuditLogQueryDTO extends createZodDto(AuditLogQuerySchema) {}
export class AuditLogResDTO extends createZodDto(AuditLogResSchema) {}
