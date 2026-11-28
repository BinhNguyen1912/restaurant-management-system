import {
  hashOtpCode,
  isOtpCodeMatch,
  MAX_OTP_ATTEMPTS,
  MAX_OTP_SENDS,
  OTP_SEND_WINDOW_MINUTES,
  otpSendWindowStart,
  registerOtpMismatch,
} from '@/routes/auth/otp-policy'

/**
 * Chính sách OTP (prod-readiness M1 "OTP: không đếm lần sai, code cũ còn sống, code plaintext").
 *
 * Ba tính chất phải khoá cứng, vì sai một cái là hoặc dò được mã 6 số trong 5 phút, hoặc chính
 * khách không xin lại được mã:
 * (a) DB chỉ giữ sha256(code) — so mã phải so hash, không so plaintext;
 * (b) chạm ngưỡng lượt nhập sai thì mã chết, phải xin mã mới;
 * (c) cửa sổ đếm lượt GỬI là 15 phút, và số lượt gửi bị chặn để không ai biến server thành
 *     máy bắn email.
 */
const NOW = new Date('2026-11-28T10:00:00.000Z')

describe('hashOtpCode', () => {
  it('trả sha256 hex 64 ký tự, không chứa mã gốc', () => {
    const hash = hashOtpCode('123456')

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('123456')
  })

  it('cùng mã cho cùng hash, khác mã cho hash khác', () => {
    expect(hashOtpCode('123456')).toBe(hashOtpCode('123456'))
    expect(hashOtpCode('123456')).not.toBe(hashOtpCode('123457'))
  })
})

describe('isOtpCodeMatch', () => {
  it('mã đúng thì khớp', () => {
    expect(isOtpCodeMatch(hashOtpCode('654321'), '654321')).toBe(true)
  })

  it('mã sai thì không khớp', () => {
    expect(isOtpCodeMatch(hashOtpCode('654321'), '654322')).toBe(false)
  })

  it('hash rỗng hoặc sai định dạng thì không khớp, không ném lỗi', () => {
    expect(isOtpCodeMatch('', '654321')).toBe(false)
    expect(isOtpCodeMatch('khong-phai-hash', '654321')).toBe(false)
  })
})

describe('registerOtpMismatch', () => {
  it('dưới ngưỡng thì chỉ đếm, mã còn sống', () => {
    expect(registerOtpMismatch(0)).toEqual({ attempts: 1, exhausted: false })
    expect(registerOtpMismatch(MAX_OTP_ATTEMPTS - 1)).toEqual({ attempts: MAX_OTP_ATTEMPTS, exhausted: true })
  })

  it('chạm ngưỡng thì mã hết hiệu lực, và vẫn báo hết hiệu lực ở các lần sau', () => {
    expect(registerOtpMismatch(MAX_OTP_ATTEMPTS).exhausted).toBe(true)
    expect(registerOtpMismatch(MAX_OTP_ATTEMPTS + 3).exhausted).toBe(true)
  })

  it('ngưỡng là 5 lượt — không phải 4, không phải 10', () => {
    expect(MAX_OTP_ATTEMPTS).toBe(5)
  })
})

describe('otpSendWindowStart', () => {
  it('lùi đúng 15 phút so với mốc hiện tại', () => {
    const start = otpSendWindowStart(NOW)

    expect(start.toISOString()).toBe('2026-11-28T09:45:00.000Z')
    expect(OTP_SEND_WINDOW_MINUTES).toBe(15)
  })

  it('chặn số lượt gửi trong một cửa sổ', () => {
    expect(MAX_OTP_SENDS).toBe(5)
  })
})
