import { emailFingerprint, normalizeEmailForLog } from '@/routes/auth/login-attempt'

/**
 * Định danh trong nhật ký thử đăng nhập (xem `LoginAttempt.emailHash`).
 *
 * Điều phải giữ, vì sai là nhật ký ghi sai người:
 *  - cùng một email gõ hoa/thường hay kèm dấu cách vẫn ra một hash — nếu không thì kẻ dò chỉ cần đổi
 *    chữ hoa là mỗi lần thử thành một "định danh mới" và bộ đếm vô dụng;
 *  - hai email khác nhau ra hai hash (không đụng nhau sau khi chuẩn hoá);
 *  - email thô KHÔNG xuất hiện trong kết quả — đây là điều kiện của cả bảng.
 */
describe('normalizeEmailForLog', () => {
  it('cắt khoảng trắng và đưa về chữ thường', () => {
    expect(normalizeEmailForLog('  Admin@Order.COM ')).toBe('admin@order.com')
  })

  it('không bỏ dấu chấm hay +tag: hai địa chỉ đó là hai tài khoản riêng', () => {
    expect(normalizeEmailForLog('a.b+nhanvien@order.com')).toBe('a.b+nhanvien@order.com')
  })
})

describe('emailFingerprint', () => {
  it('ra hex 64 ký tự như cột CHAR(64)', () => {
    expect(emailFingerprint('admin@order.com')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('cùng email viết khác kiểu vẫn ra một hash', () => {
    expect(emailFingerprint(' Admin@Order.com ')).toBe(emailFingerprint('admin@order.com'))
  })

  it('hai email khác nhau ra hai hash', () => {
    expect(emailFingerprint('admin@order.com')).not.toBe(emailFingerprint('letan@order.com'))
  })

  it('không chứa email thô', () => {
    const hash = emailFingerprint('admin@order.com')

    expect(hash).not.toContain('admin')
    expect(hash).not.toContain('@')
  })
})
