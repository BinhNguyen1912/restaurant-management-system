import { createHash } from 'crypto'

/**
 * Chuẩn hoá email trước khi băm.
 *
 * Chỉ `trim` + `toLowerCase`: đúng phần chắc chắn không đổi nghĩa. Cố ý KHÔNG bỏ dấu chấm hay `+tag`
 * kiểu Gmail — trong hệ thống này `a.b@gmail.com` và `ab@gmail.com` đăng ký được thành hai tài khoản
 * riêng, nên gộp chúng là ghi nhật ký dò mật khẩu cho nhầm người.
 */
export function normalizeEmailForLog(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * `sha256(email chuẩn hoá)`, hex 64 ký tự — đúng kiểu cột `LoginAttempt.emailHash`.
 *
 * Mục đích: đếm được "định danh này bị thử đăng nhập bao nhiêu lần" mà không phải giữ email.
 *
 * Giới hạn phải nói thẳng: hash KHÔNG phải ẩn danh. Ai có danh sách email ứng viên thì băm từng cái
 * rồi so là ra định danh thật — với email dạng tên.công ty thì còn dễ hơn. Nó chỉ chặn hai đường:
 * đọc thẳng bảng và lỡ tay export cột ra ngoài.
 *
 * Muốn chặn cả đường từ điển thì phải HMAC bằng một khoá bí mật, đổi lại: mất khoá (hoặc xoay khoá)
 * là mất khả năng tương quan với các dòng cũ. Chưa làm — ghi ở docs/pii-retention-policy.md §5.
 */
export function emailFingerprint(email: string): string {
  return createHash('sha256').update(normalizeEmailForLog(email)).digest('hex')
}
