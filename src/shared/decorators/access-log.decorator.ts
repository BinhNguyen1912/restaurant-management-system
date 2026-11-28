import { SetMetadata } from '@nestjs/common'
import { AccessSubject } from '@prisma/client'

export const ACCESS_LOG_KEY = 'accessLogRoute'

export type AccessLogMeta = {
  /** route khai tay, dạng "GET /customers/:id" */
  route: string
  /**
   * Chủ thể bị đọc và tên param chứa id của nó. BỎ TRỐNG với route danh sách: đọc cả trang thì
   * không gắn cho một hồ sơ nào — `resultCount` mới là thứ mô tả lần đọc đó.
   */
  subject?: { type: AccessSubject; param: string }
}

/**
 * Đánh dấu handler có ĐỌC dữ liệu cá nhân — `AccessLogInterceptor` sẽ ghi một dòng nhật ký.
 *
 * `route` khai bằng tay dạng "GET /customers/:id" thay vì đọc mẫu route từ express: mẫu route của
 * express đổi theo phiên bản/framework, còn dòng nhật ký phải đọc lại được sau vài năm. Đổi tên
 * route thì phải đổi ở đây — nếu không nhật ký ghi một đường, API chạy một nẻo.
 *
 * Chỉ đánh dấu route THẬT SỰ trả về dữ liệu cá nhân. Dán cho mọi route thì bảng phình trong một
 * tuần và không ai đọc lại được nữa.
 */
export const LogAccess = (meta: AccessLogMeta) => SetMetadata(ACCESS_LOG_KEY, meta)

/**
 * Route đọc hồ sơ khách theo `:id` — 5 route của module khách dùng chung đúng một hình dạng, gói lại
 * để không phải gõ tay cặp (CUSTOMER, 'id') năm lần và gõ sai một lần.
 */
export const LogCustomerAccess = (route: string) =>
  LogAccess({ route, subject: { type: AccessSubject.CUSTOMER, param: 'id' } })
