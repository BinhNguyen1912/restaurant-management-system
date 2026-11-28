/**
 * Luật ẨN DANH HOÁ hồ sơ khách — NĐ 13/2023/NĐ-CP (xoá dữ liệu cá nhân khi đã hết mục đích xử lý).
 *
 * Vì sao ẩn danh chứ không xoá dòng: hoá đơn, sổ cái và điểm thưởng phải giữ theo luật kế toán
 * (xem docs/pii-retention-policy.md §5 — chỗ này hai luật xung đột và kế toán phải ký). Nên hồ sơ
 * được THAY giá trị chứ không xoá: `Order.customerId` vẫn trỏ tới một dòng, nhưng dòng đó không còn
 * là của ai — không tra được theo SĐT, không gọi được, không gửi ưu đãi được.
 *
 * Thời hạn lưu KHÔNG nằm trong code. Mỗi lần chạy phải truyền `--months=N`; con số đó do kế toán +
 * luật sư chốt (§3 của tài liệu trên), không phải do lập trình viên chọn hộ.
 */

/** Tên thay thế sau khi ẩn danh. */
export const ANONYMIZED_NAME = 'Khách đã ẩn danh'

/**
 * SĐT thay thế của hồ sơ khách.
 *
 * Hai ràng buộc: (1) cột `Customer.phone` là UNIQUE nên giá trị thay thế phải duy nhất theo hồ sơ;
 * (2) nó KHÔNG được trông giống SĐT thật, nếu không hồ sơ ẩn danh có thể bị tra ra và gán cho người
 * khác. Dạng `anonymized:<id>` không qua được bộ chuẩn hoá SĐT nên cũng không thể đăng ký lại.
 */
export function anonymizedPhone(customerId: number): string {
  return `anonymized:${customerId}`
}

/** SĐT thay thế cho lượt đặt bàn (cột này không unique nên dùng chung một hằng số). */
export const ANONYMIZED_RESERVATION_PHONE = 'anonymized'

/**
 * Mốc hết thời hạn lưu, tính theo THÁNG (chính sách nói theo tháng, không phải `30 * ngày`).
 *
 * Hai chi tiết dễ sai và đều được xử lý ở đây:
 *  - ngày không tồn tại ở tháng đích: `setMonth` mặc định TRÀN (31/3 lùi 1 tháng thành 3/3), nên
 *    phải kẹp về ngày cuối của tháng đó — 28/2, không phải mùng 3;
 *  - dùng getters/setters UTC để mốc không phụ thuộc múi giờ của máy chạy job.
 */
export function retentionCutoff(now: Date, retentionMonths: number): Date {
  const cutoff = new Date(now.getTime())
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths)
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate()
  cutoff.setUTCDate(Math.min(day, lastDay))
  return cutoff
}

export type RetentionInput = {
  /** lần hoạt động cuối: tạo hồ sơ, đơn hàng, đặt bàn hoặc lần ghi nhận đồng ý */
  lastActivityAt: Date
  /** số đơn CHƯA thu tiền của khách */
  openOrders: number
  now: Date
  retentionMonths: number
}

/**
 * Hồ sơ đã hết thời hạn lưu chưa — hàm duy nhất quyết định việc xoá PII.
 *
 * Fail closed ở cả hai phía:
 *  - thời hạn không dương (quên truyền, truyền 0, truyền NaN) ⇒ KHÔNG ẩn danh. Cấu hình sai không
 *    được phép biến thành lệnh xoá dữ liệu;
 *  - còn đơn chưa thu tiền ⇒ KHÔNG ẩn danh. Ẩn danh người đang ăn là phá việc phục vụ, và hoá đơn
 *    đó còn phải thu tiền.
 */
export function isRetentionExpired({ lastActivityAt, openOrders, now, retentionMonths }: RetentionInput): boolean {
  if (!Number.isFinite(retentionMonths) || retentionMonths <= 0) return false
  if (openOrders > 0) return false
  return lastActivityAt.getTime() < retentionCutoff(now, retentionMonths).getTime()
}
