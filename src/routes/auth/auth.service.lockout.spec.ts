import { AccountLockedException } from '@/routes/auth/auth.error'
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS } from '@/routes/auth/login-lockout'
import { AuthService } from '@/routes/auth/auth.service'

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
    roleId: 2,
    role: { name: 'KE_TOAN', permissions: [] },
  }

  const sharedUserRepo = {
    findUserIncludeRolePermissions: jest.fn(async () => user),
    findBranchOfUser: jest.fn(async () => null),
  }
  const authRepo = {
    recordLoginFailure: jest.fn(async () => ({ count: 1 })),
    clearLoginFailures: jest.fn(async () => ({ count: 1 })),
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

describe('AccountLockedException', () => {
  it('trả 423 kèm số phút còn lại (làm tròn lên, tối thiểu 1)', () => {
    const exception = AccountLockedException(11 * 60 * 1000)

    expect(exception.getStatus()).toBe(423)
    expect(exception.getResponse()).toMatchObject({ message: 'Error.AccountLocked', minutes: 11 })

    expect(AccountLockedException(1_000).getResponse()).toMatchObject({ minutes: 1 })
  })
})
