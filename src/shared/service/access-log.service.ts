import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'

/**
 * Nhật ký TRUY CẬP dữ liệu cá nhân (NĐ 13/2023/NĐ-CP, Điều 26).
 *
 * Quy tắc:
 *  - **append-only**: chỉ có `record()`, không update/delete ở bất kỳ đâu. Sửa được nhật ký thì nó
 *    không còn là bằng chứng.
 *  - **best-effort**: đọc PII hỏng nhật ký thì log lỗi, KHÔNG chặn việc đọc. Khác hẳn nghiệp vụ
 *    tiền (`AuditLogService` ghi trong `tx`) — ở đây cái đang bảo vệ là quyền của khách được tra
 *    thông tin của chính mình, không phải sổ sách.
 *  - không lưu query string: query tìm khách thường chính là SĐT/tên, chép vào nhật ký là nhân bản
 *    PII ra thêm một bảng nữa (xem `AccessLog.route`).
 */

export type RecordAccessInput = {
  actorId?: number | null
  actorRole?: string | null
  /** route đã đọc, dạng "GET /customers/:id" */
  route: string
  customerId?: number | null
  resultCount?: number | null
  ip?: string | null
}

@Injectable()
export class AccessLogService {
  private readonly logger = new Logger(AccessLogService.name)

  constructor(private readonly prismaService: PrismaService) {}

  async record(input: RecordAccessInput) {
    return this.prismaService.accessLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        route: input.route,
        customerId: input.customerId ?? null,
        resultCount: input.resultCount ?? null,
        ip: input.ip ?? null,
      },
    })
  }

  /** Ghi ngoài luồng đọc và không làm hỏng nghiệp vụ nếu lỗi (xem docstring của class). */
  async recordSafe(input: RecordAccessInput) {
    try {
      return await this.record(input)
    } catch (error: any) {
      this.logger.error(
        `Không ghi được nhật ký truy cập ${input.route} (customer #${input.customerId ?? '-'}): ${error?.message ?? error}`,
      )
      return null
    }
  }
}
