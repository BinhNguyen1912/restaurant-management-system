import {
  buildTotpUri,
  decryptTotpSecret,
  deriveTotpKey,
  encryptTotpSecret,
  generateTotpSecret,
  secondFactorKind,
  TOTP_ISSUER,
  verifyTotpCode,
} from '@/routes/auth/two-factor'

/**
 * 2FA TOTP — phần thuần (prod-readiness §M9 mục 5).
 *
 * Ba nhóm điều kiện khoá ở đây vì cả ba đều là chỗ sai một dòng là 2FA mất tác dụng mà không có
 * triệu chứng nào:
 *  (a) mã đúng thì qua, lệch chu kỳ quá xa thì không — kiểm bằng vector RFC 6238, KHÔNG bằng chính
 *      thư viện dùng để sinh mã trong production (tự kiểm mình thì luôn đạt);
 *  (b) đầu vào rác không được ném ra trên đường đăng nhập;
 *  (c) bí mật lưu xuống DB là bản mã hoá, thiếu khoá là không đọc lại được.
 */

/** '12345678901234567890' — bí mật mẫu của RFC 6238 Phụ lục B */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const KEY = deriveTotpKey('khoa-thu-nghiem-cho-unit-test-32-ky-tu')

describe('verifyTotpCode — đúng/sai theo chuẩn', () => {
  it('nhận mã đúng của đúng chu kỳ (vector RFC 6238, 6 chữ số)', () => {
    // 8 chữ số của RFC là 94287082 / 07081804 / 89005924; lấy 6 số cuối là cách cắt chuẩn của TOTP
    expect(verifyTotpCode(RFC_SECRET, '287082', 59_000)).toBe(true)
    expect(verifyTotpCode(RFC_SECRET, '081804', 1_111_111_109_000)).toBe(true)
    expect(verifyTotpCode(RFC_SECRET, '005924', 1_234_567_890_000)).toBe(true)
  })

  it('từ chối mã của chu kỳ khác', () => {
    expect(verifyTotpCode(RFC_SECRET, '081804', 59_000)).toBe(false)
    expect(verifyTotpCode(RFC_SECRET, '000000', 59_000)).toBe(false)
  })

  it('nhận mã của chu kỳ sát bên (lệch đồng hồ điện thoại) nhưng không nhận xa hơn', () => {
    // mã 287082 thuộc chu kỳ chứa mốc 59s; ±1 chu kỳ (30s) được chấp nhận
    expect(verifyTotpCode(RFC_SECRET, '287082', 59_000 + 30_000)).toBe(true)
    expect(verifyTotpCode(RFC_SECRET, '287082', 59_000 - 30_000)).toBe(true)
    expect(verifyTotpCode(RFC_SECRET, '287082', 59_000 + 90_000)).toBe(false)
  })

  it('đầu vào rác trả false, không ném — đây là đường đăng nhập', () => {
    expect(verifyTotpCode(RFC_SECRET, '12345', 59_000)).toBe(false)
    expect(verifyTotpCode(RFC_SECRET, 'abcdef', 59_000)).toBe(false)
    expect(verifyTotpCode(RFC_SECRET, '', 59_000)).toBe(false)
    expect(verifyTotpCode(RFC_SECRET, '287082 ', 59_000)).toBe(false)
  })

  it('bí mật hỏng trong DB trả false, không ném', () => {
    expect(verifyTotpCode('khong-phai-base32', '287082', 59_000)).toBe(false)
    expect(verifyTotpCode('', '287082', 59_000)).toBe(false)
  })
})

describe('bí mật TOTP — sinh và hiển thị', () => {
  it('sinh bí mật base32 mỗi lần một khác', () => {
    const a = generateTotpSecret()
    const b = generateTotpSecret()
    expect(a).toMatch(/^[A-Z2-7]+$/)
    expect(a.length).toBeGreaterThanOrEqual(32)
    expect(a).not.toBe(b)
  })

  it('URI để quét QR mang đúng issuer, email và bí mật', () => {
    const secret = generateTotpSecret()
    const uri = buildTotpUri('ketoan@nhahang.vn', secret)
    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain(`issuer=${TOTP_ISSUER}`)
    expect(uri).toContain(secret)
    expect(decodeURIComponent(uri)).toContain('ketoan@nhahang.vn')
  })
})

describe('mã hoá bí mật khi lưu DB', () => {
  it('giải mã lại đúng bí mật ban đầu', () => {
    const secret = generateTotpSecret()
    expect(decryptTotpSecret(encryptTotpSecret(secret, KEY), KEY)).toBe(secret)
  })

  it('giá trị lưu xuống không chứa bí mật dạng rõ và có phiên bản định dạng', () => {
    const secret = generateTotpSecret()
    const stored = encryptTotpSecret(secret, KEY)
    expect(stored.startsWith('v1:')).toBe(true)
    expect(stored.split(':')).toHaveLength(4)
    expect(stored).not.toContain(secret)
    // hai lần mã hoá cùng bí mật phải ra hai chuỗi khác nhau (IV ngẫu nhiên), không thì so sánh
    // hai cột là biết hai tài khoản dùng chung bí mật
    expect(encryptTotpSecret(secret, KEY)).not.toBe(stored)
  })

  it('sai khoá hoặc bản mã bị sửa thì trả null, không trả rác', () => {
    const stored = encryptTotpSecret(generateTotpSecret(), KEY)
    expect(decryptTotpSecret(stored, deriveTotpKey('khoa-khac-32-ky-tu-dai-dung-yeu-cau'))).toBeNull()
    const parts = stored.split(':')
    const tampered = [parts[0], parts[1], parts[2], parts[3].slice(0, -2) + 'AA'].join(':')
    expect(decryptTotpSecret(tampered, KEY)).toBeNull()
  })

  it('giá trị không dùng được trả null: rỗng, rác, base32 thô kiểu cũ', () => {
    expect(decryptTotpSecret(null, KEY)).toBeNull()
    expect(decryptTotpSecret('', KEY)).toBeNull()
    expect(decryptTotpSecret('JBSWY3DPEHPK3PXP', KEY)).toBeNull()
    expect(decryptTotpSecret('v1:abc:def', KEY)).toBeNull()
    expect(decryptTotpSecret('v2:aaaa:bbbb:cccc', KEY)).toBeNull()
  })
})

describe('deriveTotpKey', () => {
  it('ra 32 byte, cùng đầu vào thì cùng khoá, khác đầu vào thì khác khoá', () => {
    expect(deriveTotpKey('mot').length).toBe(32)
    expect(deriveTotpKey('mot').equals(deriveTotpKey('mot'))).toBe(true)
    expect(deriveTotpKey('mot').equals(deriveTotpKey('hai'))).toBe(false)
  })
})

describe('secondFactorKind — chọn yếu tố thứ hai', () => {
  it('TOTP thắng khi request gửi cả hai, NONE khi không gửi gì', () => {
    expect(secondFactorKind({ totpCode: '123456', emailCode: '654321' })).toBe('TOTP')
    expect(secondFactorKind({ emailCode: '654321' })).toBe('EMAIL')
    expect(secondFactorKind({ totpCode: '123456' })).toBe('TOTP')
    expect(secondFactorKind({ totpCode: null, emailCode: null })).toBe('NONE')
    expect(secondFactorKind({})).toBe('NONE')
  })
})
