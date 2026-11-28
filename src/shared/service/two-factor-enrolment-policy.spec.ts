import {
  needsTwoFactorEnrolment,
  roleRequiresTwoFactor,
  TWO_FACTOR_REQUIRED_ROLES,
} from '@/shared/service/two-factor-enrolment-policy'

describe('two-factor-enrolment-policy', () => {
  describe('roleRequiresTwoFactor', () => {
    it.each(['ADMIN', 'KE_TOAN'])('%s thuộc diện bắt buộc 2FA', (role) => {
      expect(roleRequiresTwoFactor(role)).toBe(true)
    })

    it.each(['STAFF', 'USER', 'GUEST', 'admin', 'ADMIN_TEMP', 'KE_TOAN '])('%s KHÔNG thuộc diện', (role) => {
      expect(roleRequiresTwoFactor(role)).toBe(false)
    })

    it.each([null, undefined, ''])('giá trị rỗng (%s) không thuộc diện', (role) => {
      expect(roleRequiresTwoFactor(role)).toBe(false)
    })

    it('danh sách là đúng hai vai trò trong kế hoạch', () => {
      expect([...TWO_FACTOR_REQUIRED_ROLES]).toEqual(['ADMIN', 'KE_TOAN'])
    })
  })

  describe('needsTwoFactorEnrolment', () => {
    it('bắt buộc đang TẮT thì không ai bị chặn, kể cả ADMIN chưa bật 2FA', () => {
      expect(needsTwoFactorEnrolment({ roleName: 'ADMIN', twoFactorEnabled: false, enforcement: 'off' })).toBe(false)
    })

    it('bắt buộc BẬT + ADMIN chưa bật 2FA => phải enrolment', () => {
      expect(needsTwoFactorEnrolment({ roleName: 'ADMIN', twoFactorEnabled: false, enforcement: 'on' })).toBe(true)
    })

    it('bắt buộc BẬT + KE_TOAN chưa bật 2FA => phải enrolment', () => {
      expect(needsTwoFactorEnrolment({ roleName: 'KE_TOAN', twoFactorEnabled: false, enforcement: 'on' })).toBe(true)
    })

    it('bắt buộc BẬT nhưng đã bật 2FA rồi => không chặn', () => {
      expect(needsTwoFactorEnrolment({ roleName: 'ADMIN', twoFactorEnabled: true, enforcement: 'on' })).toBe(false)
    })

    it('bắt buộc BẬT + STAFF chưa bật 2FA => không chặn (ngoài diện)', () => {
      expect(needsTwoFactorEnrolment({ roleName: 'STAFF', twoFactorEnabled: false, enforcement: 'on' })).toBe(false)
    })

    // Fail closed: chỗ đọc dùng `select` thiếu cột là chuyện có thật, và đoán "đã bật" ở đây nghĩa là
    // cho qua đúng tài khoản chưa bảo vệ.
    it('twoFactorEnabled không đọc được (undefined) coi như CHƯA bật', () => {
      expect(needsTwoFactorEnrolment({ roleName: 'ADMIN', twoFactorEnabled: undefined, enforcement: 'on' })).toBe(true)
    })

    it('vai trò không có tên (null) không bao giờ bị chặn', () => {
      expect(needsTwoFactorEnrolment({ roleName: null, twoFactorEnabled: false, enforcement: 'on' })).toBe(false)
    })
  })
})
