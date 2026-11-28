import { AccountLockedException } from '@/routes/auth/auth.error'
import { emailFingerprint } from '@/routes/auth/login-attempt'
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS } from '@/routes/auth/login-lockout'
import { AuthService } from '@/routes/auth/auth.service'
import { deriveTotpKey, encryptTotpSecret, TOTP_DIGITS, TOTP_PERIOD_SECONDS } from '@/routes/auth/two-factor'
import envConfig from '@/shared/config'
import * as OTPAuth from 'otpauth'

/**
 * Khoá đăng nhập tạm ở tầng service (prod-readiness §0.2 #3).
 *
 * Policy thuần đã được khoá bằng login-lockout.spec.ts; ở đây khoá phần nối dây — chỗ dễ sai
 * là gọi sai thứ tự hoặc quên một nhánh:
 * (a) đang khoá thì chặn TRƯỚC khi băm mật khẩu (không tốn CPU cho kẻ dò, và mật khẩu đúng
 *     cũng không vào được);
 * (b) sai thì ghi số lần vào tài khoản, chưa tới ngưỡng thì vẫn là 422 "sai mật khẩu";
 * (c) chạm ngưỡng thì khoá + ghi audit, trả 423;
 * (d) đăng nhập đúng thì xoá dấu vết sai trước đó.
 *
 * Repo/service khác được giả lập, không cần Postgres.
 */
const USER_ID = 11

function makeService(options: {
  failedAttempts?: number
  lockedUntil?: Date | null
  isPasswordValid?: boolean
  noUser?: boolean
  twoFactorEnabled?: boolean
  totpSecret?: string | null
}) {
  const user = {
    id: USER_ID,
    email: 'ketoan@nhahang.vn',
    password: 'hashed-password',
    name: 'Kế toán',
    avatar: null,
    branchId: null,
    failedAttempts: options.failedAttempts ?? 0,
    lockedUntil: options.lockedUntil ?? null,
    twoFactorEnabled: options.twoFactorEnabled ?? false,
    totpSecret: options.totpSecret ?? null,
    roleId: 2,
    role: { name: 'KE_TOAN', permissions: [] },
  }

  const sharedUserRepo = {
    findUserIncludeRolePermissions: jest.fn(async () => (options.noUser ? null : user)),
    findBranchOfUser: jest.fn(async () => null),
  }
  const authRepo = {
    recordLoginFailure: jest.fn(async () => ({ count: 1 })),
    clearLoginFailures: jest.fn(async () => ({ count: 1 })),
    recordLoginAttempt: jest.fn(async () => ({ id: 1 })),
    createRefreshToken: jest.fn(async (data: any) => data),
  }
  const tokenService = {
    createAcessToken: jest.fn(async () => 'access.token'),
    createRefreshToken: jest.fn(async () => 'refresh.token'),
    VerifyRefreshToken: jest.fn(async () => ({ exp: 1893456000 })),
  }
  const hashingService = {
    comparePassword: jest.fn(async () => options.isPasswordValid ?? false),
  }
  const auditLogService = { record: jest.fn(async () => ({})) }

  const service = new AuthService(
    sharedUserRepo as any,
    {} as any,
    authRepo as any,
    tokenService as any,
    {} as any,
    hashingService as any,
    {} as any,
    auditLogService as any,
  )

  return { service, authRepo, hashingService, auditLogService, tokenService }
}

const loginBody = { email: 'ketoan@nhahang.vn', password: 'sai-mat-khau' }

describe('AuthService.login - khoá tạm', () => {
  it('đang bị khoá thì trả 423 và không băm mật khẩu', async () => {
    const { service, hashingService, authRepo } = makeService({
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      isPasswordValid: true,
    })

    await expect(service.login(loginBody as any)).rejects.toMatchObject({ status: 423 })
    expect(hashingService.comparePassword).not.toHaveBeenCalled()
    expect(authRepo.recordLoginFailure).not.toHaveBeenCalled()
  })

  it('hết hạn khoá thì cho thử lại và đếm lại từ 1', async () => {
    const { service, authRepo } = makeService({
      failedAttempts: 0,
      lockedUntil: new Date(Date.now() - 1000),
    })

    await expect(service.login(loginBody as any)).rejects.toMatchObject({ status: 422 })
    expect(authRepo.recordLoginFailure).toHaveBeenCalledWith(USER_ID, { failedAttempts: 1, lockedUntil: null })
  })

  it('sai chưa tới ngưỡng thì chỉ tăng bộ đếm, không ghi audit', async () => {
    const { service, authRepo, auditLogService } = makeService({ failedAttempts: 2 })

    await expect(service.login(loginBody as any)).rejects.toMatchObject({ status: 422 })
    expect(authRepo.recordLoginFailure).toHaveBeenCalledWith(USER_ID, { failedAttempts: 3, lockedUntil: null })
    expect(auditLogService.record).not.toHaveBeenCalled()
  })

  it('sai lần thứ MAX thì khoá LOCK_MINUTES phút, ghi audit và trả 423', async () => {
    const { service, authRepo, auditLogService } = makeService({ failedAttempts: MAX_FAILED_ATTEMPTS - 1 })

    await expect(service.login(loginBody as any)).rejects.toMatchObject({ status: 423 })

    const [userId, state] = (authRepo.recordLoginFailure.mock.calls as unknown as [number, any][])[0]
    expect(userId).toBe(USER_ID)
    expect(state.failedAttempts).toBe(0)
    expect(state.lockedUntil.getTime()).toBeGreaterThan(Date.now() + (LOCK_MINUTES - 1) * 60 * 1000)

    expect(auditLogService.record).toHaveBeenCalledTimes(1)
    expect((auditLogService.record.mock.calls as unknown as [any][])[0][0]).toMatchObject({
      action: 'LOGIN_LOCKED',
      entityType: 'USER',
      entityId: USER_ID,
    })
  })

  it('đăng nhập đúng sau khi sai thì xoá bộ đếm', async () => {
    const { service, authRepo, tokenService } = makeService({ failedAttempts: 3, isPasswordValid: true })

    const result = await service.login(loginBody as any)

    expect(result.accessToken).toBe('access.token')
    expect(authRepo.clearLoginFailures).toHaveBeenCalledWith(USER_ID)
    expect(tokenService.createAcessToken).toHaveBeenCalled()
  })

  it('đăng nhập đúng mà không có dấu vết sai thì không UPDATE thừa', async () => {
    const { service, authRepo } = makeService({ failedAttempts: 0, lockedUntil: null, isPasswordValid: true })

    await service.login(loginBody as any)

    expect(authRepo.clearLoginFailures).not.toHaveBeenCalled()
  })
})

describe('AuthService.login - nhật ký thử đăng nhập', () => {
  /** Tham số của lần ghi nhật ký đầu tiên */
  const attempt = (authRepo: any) => (authRepo.recordLoginAttempt.mock.calls as [any][])[0][0]

  it('sai mật khẩu thì ghi FAILED, gắn đúng tài khoản bị thử và IP', async () => {
    const { service, authRepo } = makeService({ failedAttempts: 1 })

    await expect(service.login(loginBody as any, { ip: '203.0.113.9' })).rejects.toMatchObject({ status: 422 })

    expect(attempt(authRepo)).toEqual({
      emailHash: emailFingerprint('ketoan@nhahang.vn'),
      actorId: USER_ID,
      outcome: 'FAILED',
      ip: '203.0.113.9',
    })
  })

  it('email không tồn tại vẫn ghi FAILED, nhưng không gắn cho tài khoản nào', async () => {
    const { service, authRepo } = makeService({ noUser: true })

    await expect(service.login(loginBody as any)).rejects.toMatchObject({ status: 422 })

    expect(attempt(authRepo)).toMatchObject({
      emailHash: emailFingerprint(loginBody.email),
      actorId: null,
      outcome: 'FAILED',
    })
  })

  it('đang bị khoá vẫn ghi: tiếp tục thử trong lúc khoá là dấu hiệu dò', async () => {
    const { service, authRepo } = makeService({ lockedUntil: new Date(Date.now() + 60_000), isPasswordValid: true })

    await expect(service.login(loginBody as any)).rejects.toMatchObject({ status: 423 })

    expect(attempt(authRepo)).toMatchObject({ actorId: USER_ID, outcome: 'FAILED' })
  })

  it('đăng nhập đúng ghi SUCCESS', async () => {
    const { service, authRepo } = makeService({ isPasswordValid: true })

    await service.login(loginBody as any)

    expect(attempt(authRepo)).toMatchObject({ actorId: USER_ID, outcome: 'SUCCESS' })
  })

  it('chỉ hash đi vào bảng, không có email thô trong tham số ghi', async () => {
    const { service, authRepo } = makeService({ isPasswordValid: true })

    await service.login(loginBody as any)

    expect(JSON.stringify(authRepo.recordLoginAttempt.mock.calls)).not.toContain('ketoan@nhahang.vn')
  })

  it('nhật ký hỏng không làm hỏng lần đăng nhập đúng', async () => {
    const { service, authRepo } = makeService({ isPasswordValid: true })
    authRepo.recordLoginAttempt.mockRejectedValueOnce(new Error('không ghi được'))

    const result = await service.login(loginBody as any)

    expect(result.accessToken).toBe('access.token')
  })

  it('nhật ký hỏng không đổi lỗi mà người dùng nhận', async () => {
    const { service, authRepo } = makeService({ failedAttempts: 1 })
    authRepo.recordLoginAttempt.mockRejectedValueOnce(new Error('không ghi được'))

    await expect(service.login(loginBody as any)).rejects.toMatchObject({ status: 422 })
  })
})

/** Bí mật TOTP thô dùng chung cho nhóm test 2FA (base32, như ứng dụng xác thực nhận) */
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

/** Cùng khoá mà service dẫn xuất từ `ACCESS_TOKEN_SECRET` — mock phải mã hoá bằng đúng khoá đó */
const TOTP_KEY = deriveTotpKey(envConfig.ACCESS_TOKEN_SECRET)
const encryptedTotpSecret = () => encryptTotpSecret(TOTP_SECRET, TOTP_KEY)

/** Mã hiện tại của `TOTP_SECRET`, sinh bằng đúng tham số production dùng */
const currentTotpCode = () =>
  new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(TOTP_SECRET),
  }).generate()

/**
 * 2FA ở tầng login (prod-readiness §M9 mục 5).
 *
 * Bốn điều kiện phải giữ, và cả bốn đều hỏng theo hướng im lặng nếu sai:
 * (a) đã bật 2FA mà request không có mã thì KHÔNG được cấp token — nhưng cũng không phải lần thử
 *     sai (mật khẩu đã đúng), nếu không người dùng thật tự khoá mình bằng một request thiếu trường;
 * (b) mã đúng thì qua và ghi SUCCESS;
 * (c) mã sai thì tính vào CÙNG bộ đếm khoá với mật khẩu — 6 chữ số chỉ có 10^6 khả năng;
 * (d) bí mật hỏng trong DB (khoá mã hoá đã đổi) là từ chối, không phải cho qua.
 */
describe('AuthService.login - 2FA', () => {
  const loginBody = { email: 'ketoan@nhahang.vn', password: 'dung-mat-khau' }

  it('đã bật 2FA mà không gửi mã: 401, không cấp token, không tính lần sai', async () => {
    const { service, authRepo, tokenService } = makeService({
      isPasswordValid: true,
      twoFactorEnabled: true,
      totpSecret: encryptedTotpSecret(),
    })

    await expect(service.login(loginBody as any)).rejects.toMatchObject({ status: 401 })

    expect(tokenService.createAcessToken).not.toHaveBeenCalled()
    expect(authRepo.recordLoginFailure).not.toHaveBeenCalled()
    expect(authRepo.recordLoginAttempt).not.toHaveBeenCalled()
  })

  it('mã TOTP đúng thì cấp token và ghi SUCCESS', async () => {
    const { service, authRepo, tokenService } = makeService({
      isPasswordValid: true,
      twoFactorEnabled: true,
      totpSecret: encryptedTotpSecret(),
    })

    const result = await service.login({ ...loginBody, totpCode: currentTotpCode() } as any)

    expect(result.accessToken).toBe('access.token')
    expect(tokenService.createAcessToken).toHaveBeenCalled()
    const attempts = authRepo.recordLoginAttempt.mock.calls as unknown as [any][]
    expect(attempts[attempts.length - 1][0]).toMatchObject({ actorId: USER_ID, outcome: 'SUCCESS' })
  })

  it('mã sai: 422, đếm một lần sai và ghi FAILED', async () => {
    const { service, authRepo } = makeService({
      isPasswordValid: true,
      failedAttempts: 2,
      twoFactorEnabled: true,
      totpSecret: encryptedTotpSecret(),
    })

    await expect(service.login({ ...loginBody, totpCode: '000000' } as any)).rejects.toMatchObject({ status: 422 })

    expect(authRepo.recordLoginFailure).toHaveBeenCalledWith(USER_ID, { failedAttempts: 3, lockedUntil: null })
    expect((authRepo.recordLoginAttempt.mock.calls as unknown as [any][])[0][0]).toMatchObject({
      actorId: USER_ID,
      outcome: 'FAILED',
    })
  })

  it('sai mã 2FA chạm ngưỡng thì khoá tài khoản, không có cửa riêng để dò', async () => {
    const { service, authRepo, auditLogService } = makeService({
      isPasswordValid: true,
      failedAttempts: MAX_FAILED_ATTEMPTS - 1,
      twoFactorEnabled: true,
      totpSecret: encryptedTotpSecret(),
    })

    await expect(service.login({ ...loginBody, totpCode: '000000' } as any)).rejects.toMatchObject({ status: 423 })

    expect((auditLogService.record.mock.calls as unknown as [any][])[0][0]).toMatchObject({
      action: 'LOGIN_LOCKED',
      entityId: USER_ID,
    })
    expect(authRepo.recordLoginFailure).toHaveBeenCalled()
  })

  it('bí mật hỏng trong DB thì từ chối, không cho qua', async () => {
    const { service, tokenService } = makeService({
      isPasswordValid: true,
      twoFactorEnabled: true,
      totpSecret: 'v1:aaaa:bbbb:cccc',
    })

    await expect(service.login({ ...loginBody, totpCode: currentTotpCode() } as any)).rejects.toMatchObject({
      status: 422,
    })
    expect(tokenService.createAcessToken).not.toHaveBeenCalled()
  })

  it('tài khoản chưa bật 2FA thì mã gửi kèm bị bỏ qua', async () => {
    const { service, tokenService } = makeService({ isPasswordValid: true, twoFactorEnabled: false })

    const result = await service.login({ ...loginBody, totpCode: '000000' } as any)

    expect(result.accessToken).toBe('access.token')
    expect(tokenService.createAcessToken).toHaveBeenCalled()
  })
})

describe('AccountLockedException', () => {
  it('trả 423 kèm số phút còn lại (làm tròn lên, tối thiểu 1)', () => {
    const exception = AccountLockedException(11 * 60 * 1000)

    expect(exception.getStatus()).toBe(423)
    expect(exception.getResponse()).toMatchObject({ message: 'Error.AccountLocked', minutes: 11 })

    expect(AccountLockedException(1_000).getResponse()).toMatchObject({ minutes: 1 })
  })
})
