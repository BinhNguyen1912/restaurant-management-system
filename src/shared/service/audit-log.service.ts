import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@/shared/service/prisma.service'

/**
 * Nhật ký thao tác nhạy cảm (ticket #10 / ADR 0001 D9).
 *
 * Quy tắc:
 *  - **append-only**: chỉ có `record()`, không có update/delete ở bất kỳ đâu. Sửa được nhật ký
 *    thì nó không còn là bằng chứng.
 *  - truyền `tx` khi ghi trong transaction nghiệp vụ: huỷ đơn rollback thì audit cũng rollback,
 *    không có chuyện "đơn không huỷ nhưng nhật ký bảo đã huỷ".
 *  - lỗi ghi audit **không được nuốt** khi đi kèm transaction (ném ra để rollback). Với log
 *    "best-effort" bên ngoài transaction thì chỉ log lỗi, không làm hỏng nghiệp vụ.
 */

export type AuditActionType =
  | 'ORDER_CANCELLED'
  | 'ORDER_DISCOUNT_CHANGED'
  | 'ORDER_PRICE_CHANGED'
  | 'PRODUCT_PRICE_CHANGED'
  | 'PAYMENT_REFUNDED'
  // thay đổi QUYỀN TRUY CẬP: cấp/thu hồi quyền, đổi vai trò hoặc chi nhánh của tài khoản
  | 'ROLE_PERMISSIONS_CHANGED'
  | 'ROLE_CREATED'
  | 'ROLE_DELETED'
  | 'USER_ACCESS_CHANGED'
  // nhập hàng: tồn kho tăng, có ảnh bằng chứng
  | 'STOCK_RECEIVED'
  // đăng nhập sai quá ngưỡng => tài khoản bị khoá tạm (prod-readiness §0.2 #3)
  | 'LOGIN_LOCKED'
  // trừ điểm khách để giảm giá một hoá đơn (động vào tiền của khách nên phải giải trình được)
  | 'POINTS_REDEEMED'
  // ghi nhận/rút đồng ý xử lý dữ liệu cá nhân của khách (NĐ 13/2023/NĐ-CP)
  | 'CONSENT_RECORDED'
  // ẩn danh hoá hồ sơ khách đã hết thời hạn lưu / theo yêu cầu của khách
  | 'CUSTOMER_ANONYMIZED'

export type AuditEntityTypeValue =
  | 'ORDER'
  | 'PRODUCT'
  | 'SKU'
  | 'PAYMENT'
  | 'ROLE'
  | 'USER'
  | 'INGREDIENT'
  | 'CUSTOMER'

export type RecordAuditInput = {
  actorId?: number | null
  actorRole?: string | null
  action: AuditActionType
  entityType: AuditEntityTypeValue
  entityId: number
  before?: Prisma.InputJsonValue | null
  after?: Prisma.InputJsonValue | null
  reason?: string | null
  branchId?: number | null
}

/** hành động mà lý do là BẮT BUỘC (không có lý do thì không giải trình được gì) */
const REASON_REQUIRED: AuditActionType[] = ['ORDER_CANCELLED', 'PAYMENT_REFUNDED']

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name)

  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Ghi 1 dòng nhật ký.
   * @param tx transaction hiện tại (khi cần audit "cùng sống cùng chết" với nghiệp vụ)
   */
  async record(input: RecordAuditInput, tx?: Prisma.TransactionClient) {
    if (REASON_REQUIRED.includes(input.action) && !input.reason?.trim()) {
      // Lập trình viên quên truyền lý do: ném lỗi ngay tại chỗ gọi, đừng ghi nhật ký vô nghĩa
      throw new Error(`Audit "${input.action}" bắt buộc có reason`)
    }

    const client = tx ?? this.prismaService
    return client.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before ?? Prisma.JsonNull,
        after: input.after ?? Prisma.JsonNull,
        reason: input.reason?.trim() || null,
        branchId: input.branchId ?? null,
      },
    })
  }

  /**
   * Ghi ngoài transaction và KHÔNG làm hỏng nghiệp vụ nếu lỗi (trường hợp log bổ sung,
   * ví dụ đổi giá sản phẩm — mất 1 dòng log không đáng để chặn việc bán hàng).
   */
  async recordSafe(input: RecordAuditInput) {
    try {
      return await this.record(input)
    } catch (error: any) {
      this.logger.error(`Không ghi được audit ${input.action} ${input.entityType}#${input.entityId}: ${error?.message ?? error}`)
      return null
    }
  }
}
