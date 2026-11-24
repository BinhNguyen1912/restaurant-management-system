import { Controller, Get, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { AuditLogRepo } from '@/routes/audit-log/audit-log.repo'
import { AuditLogQueryDTO, AuditLogResDTO } from '@/routes/audit-log/audit-log.dtos'

/**
 * Nhật ký thao tác nhạy cảm (ticket #10) — ADMIN, CHỈ ĐỌC.
 * Không có POST/PUT/PATCH/DELETE: nhật ký append-only, sửa được thì không phải bằng chứng.
 */
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogRepo: AuditLogRepo) {}

  @Get()
  @ZodSerializerDto(AuditLogResDTO)
  async list(@Query() query: AuditLogQueryDTO) {
    const { data, totalItems } = await this.auditLogRepo.list(query)
    return {
      message: 'Success.AuditLogs',
      data,
      totalItems,
      page: query.page,
      limit: query.limit,
    }
  }
}
