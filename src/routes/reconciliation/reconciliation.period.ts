import { formatInTimeZone } from 'date-fns-tz'

/** Asia/Ho_Chi_Minh — cùng nguồn với báo cáo doanh thu */
const TZ = 'Asia/Ho_Chi_Minh'

/**
 * Kỳ đối soát mặc định = HÔM QUA (giờ VN).
 * Đối soát chạy cho "hôm qua" chứ không phải "hôm nay": trong ngày còn giao dịch đang về,
 * đối soát giữa ngày sẽ báo lệch giả.
 */
export function resolvePeriod(fromDate?: string, toDate?: string) {
  const yesterday = formatInTimeZone(new Date(Date.now() - 24 * 60 * 60 * 1000), TZ, 'yyyy-MM-dd')
  const from = fromDate?.trim() || yesterday
  const to = toDate?.trim() || from
  return { fromDate: from, toDate: to }
}

export const DEFAULT_RECONCILIATION_PERIOD = resolvePeriod()
