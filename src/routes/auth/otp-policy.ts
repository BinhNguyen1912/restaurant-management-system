import { addMinutes } from 'date-fns'
import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Chính sách OTP — phần thuần, không chạm DB (prod-readiness M1).
 *
 * DB chỉ giữ `sha256(code)`; số lượt nhập sai nằm trên chính dòng mã; số lượt gửi bị chặn theo
 * cửa sổ 15 phút. Tách khỏi service để test được ranh giới ngưỡng mà không cần Postgres.
 */

/** Số lượt nhập sai tối đa cho một mã, chạm ngưỡng thì mã bị vô hiệu */
export const MAX_OTP_ATTEMPTS = 5

/** Số lượt gửi mã tối đa cho một `(email, type)` trong một cửa sổ */
export const MAX_OTP_SENDS = 5

/** Độ dài cửa sổ đếm lượt gửi, tính bằng phút */
export const OTP_SEND_WINDOW_MINUTES = 15

/** sha256 hex của mã OTP. Mã chỉ 6 số nên hash không chống được brute-force vật lý; nó chống rò rỉ bảng. */
export function hashOtpCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

/**
 * So mã người dùng nhập với hash đã lưu.
 *
 * `timingSafeEqual` thay cho `===`: chuỗi so sánh thường trả về sớm ở ký tự đầu khác nhau, đủ để
 * đoán dần hash qua thời gian phản hồi. Độ dài khác nhau thì trả `false` luôn (hàm của Node đòi
 * hai buffer bằng độ dài); dòng mã cũ hỏng định dạng không được làm sập luồng đăng ký.
 */
export function isOtpCodeMatch(storedHash: string, code: string): boolean {
  const candidate = Buffer.from(hashOtpCode(code), 'utf8')
  const stored = Buffer.from(storedHash ?? '', 'utf8')
  if (stored.length !== candidate.length) return false
  return timingSafeEqual(stored, candidate)
}

/**
 * Ghi nhận một lượt nhập sai và cho biết mã còn sống hay đã chết.
 *
 * `exhausted` tính cả lần vừa nhập: lần thứ 5 sai là mã chết ngay, không cho lần thứ 6.
 */
export function registerOtpMismatch(attempts: number): { attempts: number; exhausted: boolean } {
  const next = attempts + 1
  return { attempts: next, exhausted: next >= MAX_OTP_ATTEMPTS }
}

/** Mốc bắt đầu cửa sổ đếm lượt gửi tính tới `now` */
export function otpSendWindowStart(now: Date): Date {
  return addMinutes(now, -OTP_SEND_WINDOW_MINUTES)
}
