import { retentionCutoff } from '@/routes/customer/customer.anonymize-policy'

/**
 * Dọn NHẬT KÝ theo thời hạn lưu — `AccessLog` (ai đọc dữ liệu cá nhân) và `LoginAttempt` (ai thử
 * đăng nhập).
 *
 * Vì sao phải dọn chứ không "giữ hết cho chắc": hai bảng này append-only và MỌI dòng đều chứa dữ
 * liệu cá nhân (IP, băm email). NĐ 13/2023 buộc ghi nhật ký truy cập (Điều 26) nhưng cũng buộc
 * không giữ dữ liệu lâu hơn mục đích xử lý — giữ vô hạn là vi phạm kiểu ngược lại, và nó âm thầm
 * biến hai bảng append-only thành kho dữ liệu cá nhân lớn nhất hệ thống. Giá trị điều tra của một
 * dòng nhật ký cũng giảm rất nhanh: sự cố cần truy vết thì đã lộ trong vài tuần đầu.
 *
 * Thời hạn lưu KHÔNG nằm trong code (cùng nguyên tắc với `customer.anonymize-policy`): mỗi lần chạy
 * phải truyền `--months=N`, con số do kế toán + luật sư chốt ở docs/pii-retention-policy.md §3. Một
 * con số pháp lý không được sinh ra từ sự tiện tay của người viết script.
 */

/** Hai bảng nhật ký được dọn. Thêm bảng mới = thêm một giá trị ở đây + một câu SQL ở `log-retention.ts`. */
export type RetentionLogTable = 'AccessLog' | 'LoginAttempt'

export const RETENTION_LOG_TABLES: readonly RetentionLogTable[] = ['AccessLog', 'LoginAttempt']

/**
 * Số dòng xoá mặc định trong MỘT lần chạy.
 *
 * Không phải để tiết kiệm tài nguyên: đây là chốt an toàn cho lúc gõ sai (`--months=1` thay vì
 * `--months=12`, hoặc lần chạy đầu tiên trên một bảng chưa từng được dọn). Xoá 5000 dòng một lượt
 * thì người chạy kịp đọc con số rồi mới chạy tiếp; xoá cả bảng trong một giây thì không kịp nhìn gì
 * và bằng chứng đã mất.
 */
export const DEFAULT_PRUNE_LIMIT = 5000

/** Cận trên tuyệt đối, kể cả khi người chạy xin nhiều hơn: một lần chạy không xoá quá 50 nghìn dòng. */
export const MAX_PRUNE_LIMIT = 50_000

export type PrunePlan = {
  /** xoá mọi dòng có `createdAt` TRƯỚC mốc này */
  cutoff: Date
  retentionMonths: number
  /** trần số dòng mỗi bảng trong lần chạy này */
  limit: number
  tables: readonly RetentionLogTable[]
}

/** `--limit` có dùng được không: số nguyên dương, hữu hạn. */
export function isUsableLimit(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/** `--months` có dùng được không: số dương hữu hạn (số tháng được phép lẻ, ví dụ 0.5 để thử nhanh). */
export function isUsableRetentionMonths(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/**
 * Kế hoạch dọn. Trả `null` khi tham số không hợp lệ — chỗ gọi KHÔNG được tự thay bằng một con số
 * khác: cấu hình sai không được biến thành lệnh xoá nhật ký.
 *
 * Mốc dùng chung `retentionCutoff` với việc ẩn danh khách, nên cái bẫy ngày-cuối-tháng (31/3 lùi một
 * tháng phải ra 28/2, không phải 3/3) chỉ có MỘT bản cài đặt. Hai bản sao của phép tính này là hai
 * chỗ để cùng một lỗi sống sót.
 */
export function planPrune(input: { now: Date; retentionMonths: number; limit?: number }): PrunePlan | null {
  const { now, retentionMonths, limit } = input
  if (!isUsableRetentionMonths(retentionMonths)) return null
  if (limit !== undefined && !isUsableLimit(limit)) return null
  return {
    cutoff: retentionCutoff(now, retentionMonths),
    retentionMonths,
    limit: Math.min(limit ?? DEFAULT_PRUNE_LIMIT, MAX_PRUNE_LIMIT),
    tables: RETENTION_LOG_TABLES,
  }
}
