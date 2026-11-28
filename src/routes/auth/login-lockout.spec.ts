import {
  evaluateLoginLock,
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  registerFailedAttempt,
} from '@/routes/auth/login-lockout'

/**
 * Khoá đăng nhập tạm (prod-readiness §0.2 #3).
 *
 * Bốn tính chất phải khoá cứng, vì sai một cái là hoặc tài khoản bị khoá vô hạn (nhân viên
 * không vào được giữa giờ bán), hoặc kẻ dò mật khẩu được thử không giới hạn:
 * (a) dưới ngưỡng thì chỉ đếm, chưa khoá;
 * (b) chạm ngưỡng thì khoá đúng LOCK_MINUTES phút;
 * (c) đang khoá thì mọi lần thử đều bị chặn, kể cả mật khẩu đúng;
 * (d) hết hạn khoá thì đếm lại từ đầu — không thì một lần gõ sai sau khi mở khoá lại khoá tiếp.
 */
const NOW = new Date('2026-11-28T10:00:00.000Z')

describe('evaluateLoginLock', () => {
  it('chưa từng bị khoá thì không chặn', () => {
    expect(evaluateLoginLock(null, NOW)).toEqual({ locked: false, remainingMs: 0 })
  })

  it('đang trong thời gian khoá thì chặn và trả thời gian còn lại', () => {
    const lockedUntil = new Date(NOW.getTime() + 10 * 60 * 1000)

    const state = evaluateLoginLock(lockedUntil, NOW)

    expect(state.locked).toBe(true)
    expect(state.remainingMs).toBe(10 * 60 * 1000)
  })

  it('hết hạn khoá thì không chặn', () => {
    const lockedUntil = new Date(NOW.getTime() - 1)

    expect(evaluateLoginLock(lockedUntil, NOW)).toEqual({ locked: false, remainingMs: 0 })
  })
})

describe('registerFailedAttempt', () => {
  it('dưới ngưỡng thì chỉ tăng bộ đếm', () => {
    for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      const outcome = registerFailedAttempt({ failedAttempts: attempt - 1, lockedUntil: null }, NOW)

      expect(outcome.failedAttempts).toBe(attempt)
      expect(outcome.lockedUntil).toBeNull()
      expect(outcome.justLocked).toBe(false)
    }
  })

  it('chạm ngưỡng thì khoá đúng LOCK_MINUTES phút', () => {
    const outcome = registerFailedAttempt({ failedAttempts: MAX_FAILED_ATTEMPTS - 1, lockedUntil: null }, NOW)

    expect(outcome.justLocked).toBe(true)
    expect(outcome.lockedUntil?.toISOString()).toBe(
      new Date(NOW.getTime() + LOCK_MINUTES * 60 * 1000).toISOString(),
    )
    // Bộ đếm về 0 để sau khi mở khoá còn đúng MAX lượt thử mới, không khoá lại ngay lần sai đầu
    expect(outcome.failedAttempts).toBe(0)
  })

  it('đang khoá thì không đổi gì (không đếm thêm, không gia hạn)', () => {
    const lockedUntil = new Date(NOW.getTime() + 5 * 60 * 1000)

    const outcome = registerFailedAttempt({ failedAttempts: 0, lockedUntil }, NOW)

    expect(outcome).toEqual({ failedAttempts: 0, lockedUntil, justLocked: false })
  })

  it('hết hạn khoá thì đếm lại từ 1', () => {
    const expired = new Date(NOW.getTime() - 1000)

    const outcome = registerFailedAttempt({ failedAttempts: 0, lockedUntil: expired }, NOW)

    expect(outcome.failedAttempts).toBe(1)
    expect(outcome.lockedUntil).toBeNull()
    expect(outcome.justLocked).toBe(false)
  })
})
