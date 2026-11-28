import { hashOtpCode, MAX_OTP_ATTEMPTS, MAX_OTP_SENDS } from '@/routes/auth/otp-policy'
import { AuthService } from '@/routes/auth/auth.service'
import { TypeOfVerification } from '@/shared/constants/auth.constant'
import { HttpException } from '@nestjs/common'

/**
 * OTP ở tầng service (prod-readiness M1: "không đếm lần sai, code cũ còn sống, code plaintext").
 *
 * Policy thuần đã khoá bằng otp-policy.spec.ts; ở đây khoá phần nối dây:
 * (a) mã lưu xuống DB là hash, còn mã gửi cho khách là plaintext — hai thứ khác nhau;
 * (b) gửi quá ngưỡng trong cửa sổ thì chặn TRƯỚC khi gửi email;
 * (c) gửi email hỏng thì trả lại lượt (xoá dòng vừa tạo), không đốt quota của khách;
 * (d) nhập sai thì đếm; chạm ngưỡng thì vô hiệu mã và trả 429;
 * (e) mã đúng thì claim một lần, không còn `delete` lần hai ở `register`/`forgotPassword`.
 *
 * Repo/service khác được giả lập, không cần Postgres.
 */
const EMAIL = 'khach@nhahang.vn'

function makeService(options: {
  issue?: { status: 'RATE_LIMITED' } | { status: 'ISSUED'; record: any }
  activeCode?: any
  emailError?: any
  existingUser?: any
}) {
  const record = {
    id: 7,
    email: EMAIL,
    codeHash: hashOtpCode('123456'),
    type: 'REGISTER',
    attempts: 0,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    createdAt: new Date(),
  }
  const issueResult = options.issue ?? { status: 'ISSUED', record }

  const sharedUserRepo = {
    findUniqueUser: jest.fn(async () => (options.existingUser === undefined ? null : options.existingUser)),
    update: jest.fn(async () => ({})),
  }
  const authRepo = {
    issueVerificationCode: jest.fn(async (_input: any) => issueResult),
    findActiveVerificationCode: jest.fn(async (_where: any) =>
      options.activeCode === undefined ? record : options.activeCode,
    ),
    incrementVerificationAttempt: jest.fn(async (_id: number) => 1),
    consumeVerificationCode: jest.fn(async (_id: number) => 1),
    deleteVerificationCode: jest.fn(async (_where: any) => 1),
    createRefreshToken: jest.fn(async (data: any) => data),
  }
  const emailService = {
    sendEmail: jest.fn(async (_payload: any) => ({ error: options.emailError ?? null })),
  }
  const hashingService = {
    hashPassword: jest.fn(async () => 'hashed-new-password'),
    comparePassword: jest.fn(async () => true),
  }
  const sharedRefreshTokenRepo = { revokeUserRefreshTokens: jest.fn(async () => ({ count: 1 })) }
  const tokenService = {
    createAcessToken: jest.fn(async () => 'access.token'),
    createRefreshToken: jest.fn(async () => 'refresh.token'),
    VerifyRefreshToken: jest.fn(async () => ({ exp: 1893456000 })),
  }

  const service = new AuthService(
    sharedUserRepo as any,
    emailService as any,
    authRepo as any,
    tokenService as any,
    { getRoleClient: jest.fn(async () => ({ roleId: 3, roleName: 'STAFF' })) } as any,
    hashingService as any,
    sharedRefreshTokenRepo as any,
    { record: jest.fn(async () => ({})) } as any,
  )

  return { service, authRepo, emailService, sharedUserRepo, sharedRefreshTokenRepo }
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise
  } catch (error) {
    return (error as HttpException).getStatus()
  }
  throw new Error('Mong đợi một exception nhưng promise resolve bình thường')
}

describe('sendOTP', () => {
  it('quá ngưỡng lượt gửi trong cửa sổ thì chặn trước khi gửi email', async () => {
    const { service, authRepo, emailService } = makeService({ issue: { status: 'RATE_LIMITED' } })

    expect(await statusOf(service.sendOTP({ email: EMAIL, type: TypeOfVerification.REGISTER }))).toBe(429)
    expect(emailService.sendEmail).not.toHaveBeenCalled()
    expect(authRepo.issueVerificationCode).toHaveBeenCalledTimes(1)
  })

  it('lưu hash của mã chứ không lưu mã, còn email nhận mã plaintext', async () => {
    const { service, authRepo, emailService } = makeService({})

    await service.sendOTP({ email: EMAIL, type: TypeOfVerification.REGISTER })

    const issued = authRepo.issueVerificationCode.mock.calls[0][0] as any
    const sent = (emailService.sendEmail.mock.calls[0][0] as any).code

    expect(sent).toMatch(/^\d{6}$/)
    expect(issued.codeHash).toBe(hashOtpCode(sent))
    expect(issued.codeHash).not.toBe(sent)
    expect(issued.maxSends).toBe(MAX_OTP_SENDS)
    expect(issued.windowStart).toBeInstanceOf(Date)
  })

  it('gửi email hỏng thì xoá dòng vừa tạo để trả lại lượt cho khách', async () => {
    const { service, authRepo } = makeService({ emailError: { name: 'validation_error' } })

    await expect(service.sendOTP({ email: EMAIL, type: TypeOfVerification.REGISTER })).rejects.toEqual({
      name: 'validation_error',
    })
    expect(authRepo.deleteVerificationCode).toHaveBeenCalledWith(7)
  })
})

describe('verificationCode', () => {
  it('mã đúng thì claim đúng một lần và trả dòng mã', async () => {
    const { service, authRepo } = makeService({})

    const result = await service.verificationCode({ email: EMAIL, code: '123456', type: TypeOfVerification.REGISTER })

    expect(authRepo.consumeVerificationCode).toHaveBeenCalledWith(7)
    expect(authRepo.incrementVerificationAttempt).not.toHaveBeenCalled()
    expect(result.id).toBe(7)
  })

  it('mã sai thì đếm lượt và báo mã không đúng, chưa vô hiệu', async () => {
    const { service, authRepo } = makeService({})

    expect(await statusOf(service.verificationCode({ email: EMAIL, code: '000000', type: TypeOfVerification.REGISTER }))).toBe(
      422,
    )
    expect(authRepo.incrementVerificationAttempt).toHaveBeenCalledWith(7)
    expect(authRepo.consumeVerificationCode).not.toHaveBeenCalled()
  })

  it(`lần sai thứ ${MAX_OTP_ATTEMPTS} thì vô hiệu mã và trả 429`, async () => {
    const { service, authRepo } = makeService({
      activeCode: {
        id: 7,
        email: EMAIL,
        codeHash: hashOtpCode('123456'),
        type: 'REGISTER',
        attempts: MAX_OTP_ATTEMPTS - 1,
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      },
    })

    expect(await statusOf(service.verificationCode({ email: EMAIL, code: '000000', type: TypeOfVerification.REGISTER }))).toBe(
      429,
    )
    expect(authRepo.consumeVerificationCode).toHaveBeenCalledWith(7)
  })

  it('mã hết hạn thì báo hết hạn và không đếm lượt', async () => {
    const { service, authRepo } = makeService({
      activeCode: {
        id: 7,
        email: EMAIL,
        codeHash: hashOtpCode('123456'),
        type: 'REGISTER',
        attempts: 0,
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      },
    })

    expect(await statusOf(service.verificationCode({ email: EMAIL, code: '123456', type: TypeOfVerification.REGISTER }))).toBe(
      422,
    )
    expect(authRepo.incrementVerificationAttempt).not.toHaveBeenCalled()
  })

  it('không có mã nào đang sống thì báo không tìm thấy, không chạm DB ghi', async () => {
    const { service, authRepo } = makeService({ activeCode: null })

    expect(await statusOf(service.verificationCode({ email: EMAIL, code: '123456', type: TypeOfVerification.REGISTER }))).toBe(
      422,
    )
    expect(authRepo.incrementVerificationAttempt).not.toHaveBeenCalled()
    expect(authRepo.consumeVerificationCode).not.toHaveBeenCalled()
  })

  it('request thứ hai dùng lại cùng mã thì bị chặn (claim trả 0)', async () => {
    const { service, authRepo } = makeService({})
    authRepo.consumeVerificationCode.mockResolvedValueOnce(0)

    expect(await statusOf(service.verificationCode({ email: EMAIL, code: '123456', type: TypeOfVerification.REGISTER }))).toBe(
      422,
    )
  })
})

describe('forgotPassword', () => {
  it('đổi mật khẩu không xoá mã lần hai — mã đã bị claim lúc kiểm', async () => {
    const { service, authRepo, sharedRefreshTokenRepo } = makeService({
      existingUser: { id: 11, email: EMAIL },
    })

    await service.forgotPassword({
      email: EMAIL,
      code: '123456',
      newPassword: 'MatKhauMoi123',
      confirmNewPassword: 'MatKhauMoi123',
    })

    expect(authRepo.consumeVerificationCode).toHaveBeenCalledTimes(1)
    expect(authRepo.deleteVerificationCode).not.toHaveBeenCalled()
    expect(sharedRefreshTokenRepo.revokeUserRefreshTokens).toHaveBeenCalledWith(11)
  })
})
