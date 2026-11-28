/**
 * Nhận diện khách hàng — hàm thuần, không chạm DB.
 *
 * Danh tính khách trong hệ thống này là **số điện thoại**, vì đó là thứ duy nhất có mặt ở mọi
 * luồng (khách đặt bàn nhập tay, khách đăng ký tài khoản, khách quét QR thì không có gì cả).
 * Nhưng SĐT trong dữ liệu cũ được gõ tự do: "0901 234 567", "+84901234567", "0901.234.567".
 * Không chuẩn hoá thì mỗi cách gõ thành một khách khác nhau và toàn bộ phần báo cáo phía sau
 * là số ảo.
 */

/** SĐT dài nhất/hợp lệ của VN: 10 số (di động), 11 số (đầu 02x cũ) — 9 số là số bàn không đầu 0. */
const MIN_DIGITS = 9
const MAX_DIGITS = 11
/** Đầu số quốc tế của VN; "0084…" là dạng gõ dài của "+84…". */
const COUNTRY_CODE = '84'

/**
 * Chuẩn hoá SĐT về dạng khoá nhận diện: chỉ chữ số, đầu số quốc tế đổi về 0.
 *
 * Trả `null` khi không đủ tin cậy để coi là cùng một người (rỗng, "abc", 3 số, 20 số). Thà
 * không có hồ sơ còn hơn gộp hai người khác nhau vào một dòng — mọi số liệu sau đó sẽ sai mà
 * không có dấu hiệu gì.
 */
export function normalizeCustomerPhone(raw?: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null

  let phone = digits
  if (phone.startsWith('0084')) phone = `0${phone.slice(4)}`
  else if (phone.length === MAX_DIGITS && phone.startsWith(COUNTRY_CODE)) phone = `0${phone.slice(2)}`

  return phone.length >= MIN_DIGITS && phone.length <= MAX_DIGITS ? phone : null
}

/** Tên khách để trống thì không được ghi đè tên đã có (đặt bàn nhanh hay bỏ trống ô tên). */
export function cleanCustomerName(raw?: string | null): string | null {
  const name = raw?.trim()
  return name ? name : null
}

/**
 * Payload upsert hồ sơ khách từ một lượt đặt bàn/đơn: `update` chỉ chứa field có thông tin mới,
 * nên gọi lại nhiều lần không xoá dữ liệu người khác đã nhập.
 */
export function buildCustomerUpsert(input: { phone: string; name?: string | null; userId?: number | null }) {
  const name = cleanCustomerName(input.name)
  return {
    create: { phone: input.phone, name: name ?? input.phone, userId: input.userId ?? null },
    update: {
      ...(name ? { name } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
    },
  }
}
