import { Module } from '@nestjs/common'
import { AuditLogController } from '@/routes/audit-log/audit-log.controller'
import { AuditLogRepo } from '@/routes/audit-log/audit-log.repo'

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogRepo],
})
export class AuditLogModule {}
