import { addMinutes } from 'date-fns'

/**
 * Chính sách khoá đăng nhập tạm cho tài khoản nhân viên (prod-readiness §0.2 #3).
 *
 * Trước đây `/auth/login` chỉ trả 422 "sai mật khẩu": thử được vô hạn lần, chỉ có throttler
 * 40 request/phút/IP cản — ba chi nhánh sau một IP văn phòng thì ngưỡng đó vừa chặn nhầm
 * nhân viên thật, vừa không chặn được kẻ đổi IP. Khoá theo tài khoản bù đúng chỗ đó.
 *
 * Toàn bộ quyết định nằm ở đây dưới dạng hàm thuần, không chạm DB: test được không cần
 * Postgres, và `AuthService` chỉ còn việc đọc/ghi `User.failedAttempts` + `User.lockedUntil`.
 */

/** Sai liên tiếp bao nhiêu lần thì khoá */
export const MAX_FAILED_ATTEMPTS = 5

/** Khoá bao nhiêu phút */
export const LOCK_MINUTES = 15

export type LoginLockState = { locked: boolean; remainingMs: number }

export type FailedAttemptState = {
  failedAttempts: number
  lockedUntil: Date | null
}

export type FailedAttemptOutcome = FailedAttemptState & { justLocked: boolean }

/** Tài khoản có đang bị khoá ở thời điểm `now` không, và còn bao lâu. */
export function evaluateLoginLock(lockedUntil: Date | null | undefined, now: Date): LoginLockState {
  if (!lockedUntil) return { locked: false, remainingMs: 0 }

  const remainingMs = lockedUntil.getTime() - now.getTime()
  return remainingMs > 0 ? { locked: true, remainingMs } : { locked: false, remainingMs: 0 }
}

/**
 * Trạng thái sau một lần sai mật khẩu.
 *
 * Bộ đếm về 0 ngay khi khoá: `lockedUntil` đã giữ mốc thời gian, còn nếu để bộ đếm ở ngưỡng
 * thì lần gõ sai đầu tiên sau khi mở khoá lại rơi vào ngưỡng và khoá tiếp — tài khoản thành
 * khoá vĩnh viễn.
 *
 * Đang trong thời gian khoá thì trả nguyên trạng thái: không đếm thêm, không gia hạn (gia hạn
 * là kẻ tấn công tự do giữ tài khoản của người khác bị khoá).
 */
export function registerFailedAttempt(state: FailedAttemptState, now: Date): FailedAttemptOutcome {
  if (evaluateLoginLock(state.lockedUntil, now).locked) {
    return { ...state, justLocked: false }
  }

  const failedAttempts = state.failedAttempts + 1
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return {
      failedAttempts: 0,
      lockedUntil: addMinutes(now, LOCK_MINUTES),
      justLocked: true,
    }
  }

  return { failedAttempts, lockedUntil: null, justLocked: false }
}
