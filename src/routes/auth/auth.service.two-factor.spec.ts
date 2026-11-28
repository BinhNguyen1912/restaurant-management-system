import { AuthService } from '@/routes/auth/auth.service'
import { deriveTotpKey, encryptTotpSecret, TOTP_DIGITS, TOTP_PERIOD_SECONDS } from '@/routes/auth/two-factor'
import { hashOtpCode } from '@/routes/auth/otp-policy'
import envConfig from '@/shared/config'
import * as OTPAuth from 'otpauth'

/**
 * Bật/tắt 2FA ở tầng service (prod-readiness §M9 mục 5).
 *
 * Policy thuần (mã đúng/sai, mã hoá bí mật) đã khoá bằng two-factor.spec.ts; ở đây khoá phần nối
 * dây và những quyết định chỉ hiện ra ở tầng này:
 * (a) bí mật ghi xuống DB là bản MÃ HOÁ, và mỗi lần setup là một bí mật mới;
 * (b) chỉ bật khi đã xác nhận được mã — chưa xác nhận thì `twoFactorEnabled` phải nguyên là false;
 * (c) tắt phải có mật khẩu VÀ một yếu tố thứ hai, và OTP qua email là đường khôi phục khi mất máy;
 * (d) gọi tắt khi chưa bật là chuyện bình thường (idempotent), không phải lỗi.
 *
 * Repo/service khác được giả lập, không cần Postgres.
 */
const USER_ID = 11
const EMAIL = 'admin@nhahang.vn'

/** Bí mật TOTP thô; mock lưu bản mã hoá của chính bí mật này */
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const TOTP_KEY = deriveTotpKey(envConfig.ACCESS_TOKEN_SECRET)
const encryptedTotpSecret = () => encryptTotpSecret(TOTP_SECRET, TOTP_KEY)

const currentTotpCode = () =>
  new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(TOTP_SECRET),
  }).generate()

function makeService(options: {
  twoFactorEnabled?: boolean
  totpSecret?: string | null
  isPasswordValid?: boolean
  /** Mã email mà bản ghi `VerificationCode` trong mock chấp nhận */
  emailCode?: string
}) {
  const user = {
    id: USER_ID,
    email: EMAIL,
    password: 'hashed-password',
    name: 'Admin',
    twoFactorEnabled: options.twoFactorEnabled ?? false,
    totpSecret: options.totpSecret ?? null,
  }
  const sharedUserRepo = { findUniqueUser: jest.fn(async () => user) }
  const authRepo = {
    savePendingTotpSecret: jest.fn(async () => ({ id: USER_ID })),
    enableTwoFactor: jest.fn(async () => ({ id: USER_ID, twoFactorEnabled: true })),
    disableTwoFactor: jest.fn(async () => ({ id: USER_ID, twoFactorEnabled: false })),
    findActiveVerificationCode: jest.fn(async () => ({
      id: 7,
      email: EMAIL,
      codeHash: hashOtpCode(options.emailCode ?? '654321'),
      type: 'LOGIN',
      attempts: 0,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(),
    })),
    consumeVerificationCode: jest.fn(async () => 1),
    incrementVerificationAttempt: jest.fn(async () => ({ count: 1 })),
  }
  const hashingService = { comparePassword: jest.fn(async () => options.isPasswordValid ?? false) }
  const auditLogService = { record: jest.fn(async () => ({})) }

  const service = new AuthService(
    sharedUserRepo as any,
    {} as any,
    authRepo as any,
    {} as any,
    {} as any,
    hashingService as any,
    {} as any,
    auditLogService as any,
  )

  return { service, authRepo, hashingService, auditLogService }
}

describe('AuthService.setupTwoFactor', () => {
  it('trả bí mật + URI, nhưng chỉ bản MÃ HOÁ đi vào DB', async () => {
    const { service, authRepo } = makeService({})

    const result = await service.setupTwoFactor(USER_ID)

    expect(result.secret).toMatch(/^[A-Z2-7]+$/)
    expect(result.otpauthUri.startsWith('otpauth://totp/')).toBe(true)

    expect(authRepo.savePendingTotpSecret).toHaveBeenCalledTimes(1)
    const [, stored] = (authRepo.savePendingTotpSecret.mock.calls as unknown as [number, string][])[0]
    expect(stored.startsWith('v1:')).toBe(true)
    expect(stored).not.toContain(result.secret)
  })

  it('mỗi lần setup là một bí mật mới', async () => {
    const { service } = makeService({})

    const first = await service.setupTwoFactor(USER_ID)
    const second = await service.setupTwoFactor(USER_ID)

    expect(first.secret).not.toBe(second.secret)
  })

  it('tài khoản đã bật 2FA thì từ chối setup lại', async () => {
    const { service, authRepo } = makeService({ twoFactorEnabled: true, totpSecret: encryptedTotpSecret() })

    await expect(service.setupTwoFactor(USER_ID)).rejects.toMatchObject({ status: 422 })
    expect(authRepo.savePendingTotpSecret).not.toHaveBeenCalled()
  })
})

describe('AuthService.enableTwoFactor', () => {
  it('mã đúng thì bật và ghi audit', async () => {
    const { service, authRepo, auditLogService } = makeService({ totpSecret: encryptedTotpSecret() })

    const result = await service.enableTwoFactor(USER_ID, { totpCode: currentTotpCode() })

    expect(result.message).toContain('Đã bật')
    expect(authRepo.enableTwoFactor).toHaveBeenCalledTimes(1)
    expect((auditLogService.record.mock.calls as unknown as [any][])[0][0]).toMatchObject({
      action: 'TWO_FACTOR_ENABLED',
      entityType: 'USER',
      entityId: USER_ID,
    })
  })

  it('mã sai thì 422 và KHÔNG bật', async () => {
    const { service, authRepo } = makeService({ totpSecret: encryptedTotpSecret() })

    await expect(service.enableTwoFactor(USER_ID, { totpCode: '000000' })).rejects.toMatchObject({ status: 422 })
    expect(authRepo.enableTwoFactor).not.toHaveBeenCalled()
  })

  it('chưa setup hoặc bí mật hỏng thì 422, phải setup lại từ đầu', async () => {
    const notSetUp = makeService({ totpSecret: null })
    await expect(notSetUp.service.enableTwoFactor(USER_ID, { totpCode: currentTotpCode() })).rejects.toMatchObject({
      status: 422,
    })

    // Khoá mã hoá đã đổi ⇒ GCM không giải mã được ⇒ không được coi là "hợp lệ"
    const broken = makeService({ totpSecret: 'v1:aaaa:bbbb:cccc' })
    await expect(broken.service.enableTwoFactor(USER_ID, { totpCode: currentTotpCode() })).rejects.toMatchObject({
      status: 422,
    })
    expect(broken.authRepo.enableTwoFactor).not.toHaveBeenCalled()
  })
})

describe('AuthService.disableTwoFactor', () => {
  const body = { password: 'dung-mat-khau' }

  it('tài khoản chưa bật thì trả message, không kiểm mật khẩu', async () => {
    const { service, authRepo, hashingService } = makeService({ twoFactorEnabled: false })

    const result = await service.disableTwoFactor(USER_ID, body as any)

    expect(result.message).toContain('chưa bật')
    expect(hashingService.comparePassword).not.toHaveBeenCalled()
    expect(authRepo.disableTwoFactor).not.toHaveBeenCalled()
  })

  it('mật khẩu sai thì 422 và không tắt', async () => {
    const { service, authRepo } = makeService({
      twoFactorEnabled: true,
      totpSecret: encryptedTotpSecret(),
      isPasswordValid: false,
    })

    await expect(
      service.disableTwoFactor(USER_ID, { ...body, totpCode: currentTotpCode() } as any),
    ).rejects.toMatchObject({ status: 422 })
    expect(authRepo.disableTwoFactor).not.toHaveBeenCalled()
  })

  it('đúng mật khẩu nhưng thiếu yếu tố thứ hai thì 401, không tắt', async () => {
    const { service, authRepo } = makeService({
      twoFactorEnabled: true,
      totpSecret: encryptedTotpSecret(),
      isPasswordValid: true,
    })

    await expect(service.disableTwoFactor(USER_ID, body as any)).rejects.toMatchObject({ status: 401 })
    expect(authRepo.disableTwoFactor).not.toHaveBeenCalled()
  })

  it('mã TOTP đúng thì tắt và ghi audit', async () => {
    const { service, authRepo, auditLogService } = makeService({
      twoFactorEnabled: true,
      totpSecret: encryptedTotpSecret(),
      isPasswordValid: true,
    })

    const result = await service.disableTwoFactor(
      USER_ID,
      { ...body, totpCode: currentTotpCode() } as any,
    )

    expect(result.message).toContain('Đã tắt')
    expect(authRepo.disableTwoFactor).toHaveBeenCalledWith(USER_ID)
    expect((auditLogService.record.mock.calls as unknown as [any][])[0][0]).toMatchObject({
      action: 'TWO_FACTOR_DISABLED',
      entityId: USER_ID,
    })
  })

  it('mất điện thoại thì tắt được bằng OTP qua email', async () => {
    const { service, authRepo } = makeService({
      twoFactorEnabled: true,
      totpSecret: encryptedTotpSecret(),
      isPasswordValid: true,
      emailCode: '654321',
    })

    await expect(service.disableTwoFactor(USER_ID, { ...body, code: '654321' } as any)).resolves.toMatchObject({
      message: expect.stringContaining('Đã tắt'),
    })
    expect(authRepo.disableTwoFactor).toHaveBeenCalledWith(USER_ID)
  })

  it('mã email sai thì 422 và không tắt', async () => {
    const { service, authRepo } = makeService({
      twoFactorEnabled: true,
      totpSecret: encryptedTotpSecret(),
      isPasswordValid: true,
      emailCode: '654321',
    })

    await expect(service.disableTwoFactor(USER_ID, { ...body, code: '111111' } as any)).rejects.toMatchObject({
      status: 422,
    })
    expect(authRepo.disableTwoFactor).not.toHaveBeenCalled()
  })
})
