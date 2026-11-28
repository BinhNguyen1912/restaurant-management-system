import { SetMetadata } from '@nestjs/common'

export const ACCESS_LOG_KEY = 'accessLogRoute'

export type AccessLogMeta = { route: string }

/**
 * Đánh dấu handler có ĐỌC dữ liệu cá nhân — `AccessLogInterceptor` sẽ ghi một dòng nhật ký.
 *
 * `route` khai bằng tay dạng "GET /customers/:id" thay vì đọc mẫu route từ express: mẫu route của
 * express đổi theo phiên bản/framework, còn dòng nhật ký phải đọc lại được sau vài năm. Đổi tên
 * route thì phải đổi ở đây — nếu không nhật ký ghi một đường, API chạy một nẻo.
 */
export const LogAccess = (route: string) => SetMetadata(ACCESS_LOG_KEY, { route })
