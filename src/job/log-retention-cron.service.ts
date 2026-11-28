import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import envConfig from '@/shared/config'
import { SYSTEM_TIME_ZONE } from '@/shared/config/timezone'
import { pruneLogs } from '@/shared/service/log-retention'
import { isUsableRetentionMonths } from '@/shared/service/log-retention-policy'
import { PrismaService } from '@/shared/service/prisma.service'

/**
 * Dọn nhật ký (`AccessLog`, `LoginAttempt`) quá thời hạn lưu — chạy tự động mỗi tháng một lần.
 *
 * Ba quyết định trong file này:
 *
 *  - **Con số KHÔNG nằm trong code.** `LOG_RETENTION_MONTHS` lấy từ môi trường; thiếu hoặc vô nghĩa
 *    thì job **bỏ qua và nói ra lý do**, không tự chọn một con số. Đây là con số do người ký chính
 *    sách (kế toán + luật sư, docs/pii-retention-policy.md §3) đặt, và nó phải sửa được bằng cách
 *    sửa `.env.production` — không phải bằng một bản build mới.
 *  - **Chạy 03:00 ngày 1 mỗi tháng**, giờ hệ thống của quán (`SYSTEM_TIME_ZONE`, mặc định
 *    Asia/Ho_Chi_Minh): sau giờ đóng cửa, trước giờ nhập hàng sáng, và không cắt ngang một lượt
 *    dọn tay. Đổi sang "mỗi tuần" cũng không làm việc dọn đúng hơn: thời hạn tính theo tháng.
 *  - **Không chạy trong test.** Cron thật trong e2e sẽ xoá dòng của chính suite đang chạy và biến
 *    một cổng xanh thành đỏ ngẫu nhiên (đúng loại lỗi khó tìm nhất).
 *
 * Việc dọn vẫn để lại dấu ở log của app (dòng `Dọn nhật ký:` bên dưới): không phải AuditLog, vì
 * `AuditLog.entityId` bắt buộc là một thực thể nghiệp vụ — xem docs/pii-retention-policy.md §4b.
 */
@Injectable()
export class LogRetentionCronService {
  private readonly logger = new Logger(LogRetentionCronService.name)
  private isRunning = false

  constructor(private readonly prismaService: PrismaService) {}

  @Cron('0 3 1 * *', { timeZone: SYSTEM_TIME_ZONE })
  async pruneExpiredLogs() {
    if (process.env.NODE_ENV === 'test') return
    if (this.isRunning) {
      this.logger.warn('Lần dọn nhật ký trước chưa xong — bỏ qua lượt này')
      return
    }

    const retentionMonths = Number(envConfig.LOG_RETENTION_MONTHS)
    if (!isUsableRetentionMonths(retentionMonths)) {
      this.logger.log(
        'Bỏ qua dọn nhật ký: LOG_RETENTION_MONTHS chưa đặt hoặc không hợp lệ (con số do người ký chính sách chọn)',
      )
      return
    }

    this.isRunning = true
    try {
      const summary = await pruneLogs(this.prismaService, { now: new Date(), retentionMonths, apply: true })
      const total = summary.tables.reduce((sum, row) => sum + row.deleted, 0)
      this.logger.log(
        `Dọn nhật ký: mốc ${summary.cutoff.toISOString().slice(0, 10)} (${summary.retentionMonths} tháng), đã xoá ${total} dòng — ` +
          summary.tables.map((row) => `${row.table} ${row.deleted}/${row.overdue}`).join(', '),
      )
      for (const row of summary.tables) {
        if (row.overdue > row.deleted) {
          // Chạm trần là chuyện bình thường ở lần dọn đầu tiên (bảng chưa từng dọn), nhưng im lặng
          // thì lần sau vẫn chạm trần và không ai hiểu vì sao bảng không nhỏ đi.
          this.logger.warn(
            `${row.table}: còn ${row.overdue - row.deleted} dòng quá hạn sau lượt này (trần ${summary.limit} dòng/lần) — lượt sau sẽ dọn tiếp`,
          )
        }
      }
    } catch (error) {
      // Nuốt lỗi là đúng ở đây: cron lỗi không được làm sập app, và lượt sau sẽ thử lại. Nhưng phải
      // log ERROR để còn thấy nó trên log của container.
      this.logger.error(`Dọn nhật ký thất bại: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.isRunning = false
    }
  }
}
