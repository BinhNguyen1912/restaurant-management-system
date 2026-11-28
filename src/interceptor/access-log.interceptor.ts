import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { mergeMap, Observable } from 'rxjs'
import { REQUEST_USER_KEY } from '@/shared/constants/auth.constant'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { ACCESS_LOG_KEY, AccessLogMeta } from '@/shared/decorators/access-log.decorator'
import { AccessLogService } from '@/shared/service/access-log.service'
import { planAccessLog } from '@/interceptor/access-log-plan'

/**
 * Ghi nhật ký truy cập dữ liệu cá nhân cho những handler có `@LogAccess(...)`.
 *
 * Bốn quyết định:
 *  - chỉ handler được đánh dấu mới ghi. Nhật ký này dành cho PII; dán cho mọi route thì bảng phình
 *    trong một tuần và không ai đọc lại được nữa (nhật ký không ai đọc = không có nhật ký).
 *  - interceptor chạy SAU guard, nên request bị chặn (401/403) không vào bảng — đúng, vì nó chưa
 *    đọc được dòng nào. Các lần đăng nhập sai đã có `AuditLog`/`LOGIN_LOCKED` lo.
 *  - chờ ghi xong mới trả response. Ghi kiểu "bắn rồi quên" thì tiến trình chết đúng lúc đó là mất
 *    dòng nhật ký — mà đây là bằng chứng, không phải số liệu thống kê. Giá phải trả là một lệnh
 *    INSERT trên đường đọc.
 *  - nhưng lỗi ghi KHÔNG làm hỏng việc đọc (`recordSafe`): nhất là khách phải tra được thông tin
 *    của chính mình kể cả khi bảng nhật ký có sự cố.
 */
@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AccessLogInterceptor.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly accessLog: AccessLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AccessLogMeta | undefined>(ACCESS_LOG_KEY, context.getHandler())
    if (!meta) return next.handle()

    const http = context.switchToHttp()
    const request = http.getRequest()
    const user = request?.[REQUEST_USER_KEY] as AccessTokenPayload | undefined

    return next.handle().pipe(
      mergeMap(async (body) => {
        const plan = planAccessLog({ meta, params: request?.params, body })
        // Đăng ký toàn cục nghĩa là interceptor này chạy ở MỌI route; chỉ route có metadata mới ghi.
        // Route khai có chủ thể mà đọc không ra id là lỗi khai báo param — rơi vào đây thì im lặng
        // mới là thứ nguy hiểm, vì nhật ký vẫn ghi mà thiếu đúng thứ cần truy.
        if (meta.subject && plan.subjectId == null) {
          this.logger.warn(`Nhật ký truy cập ${meta.route}: không đọc được param "${meta.subject.param}"`)
        }
        await this.accessLog.recordSafe({
          ...plan,
          actorId: user?.userId ?? null,
          actorRole: user?.roleName ?? null,
          ip: request?.ip ?? null,
        })
        return body
      }),
    )
  }
}
