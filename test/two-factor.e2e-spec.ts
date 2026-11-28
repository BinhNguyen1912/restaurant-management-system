import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import * as OTPAuth from 'otpauth'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { TOTP_DIGITS, TOTP_PERIOD_SECONDS } from '../src/routes/auth/two-factor'
import { hashOtpCode } from '../src/routes/auth/otp-policy'
import { HashingService } from '../src/shared/service/hashing.service'
import { PrismaService } from '../src/shared/service/prisma.service'

/**
 * 2FA bằng ứng dụng xác thực, đi qua HTTP thật.
 *
 * Điều phải chứng minh (không phải "đã thêm ba route"):
 *  - bí mật KHÔNG bao giờ rời API ở dạng đọc lại được: setup trả đúng một lần, còn cột DB là bản
 *    mã hoá `v1:...` không chứa bí mật;
 *  - chưa xác nhận được mã thì 2FA chưa có hiệu lực (`twoFactorEnabled` vẫn false) — nếu không, một
 *    lần quét QR hỏng là tài khoản tự khoá mình ra ngoài;
 *  - đã bật thì đăng nhập bằng mật khẩu KHÔNG cấp token (401 kèm `Error.TwoFactorRequired`), mã sai
 *    thì 422, mã đúng mới có token;
 *  - mất điện thoại vẫn vào được bằng OTP qua email (đường khôi phục, dùng `VerificationCode` sẵn có);
 *  - tắt 2FA đòi cả mật khẩu và một yếu tố thứ hai, và để lại audit;
 *  - ba route này không phải route công khai.
 */
describe('2FA bằng TOTP (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let hashing: HashingService

  const EMAIL = 'hai-yeu-to@order.com'
  const PASSWORD = '123456'
  let userId: number
  let accessToken: string
  let secret: string

  const api = () => request(app.getHttpServer())
  /** Request có Bearer token — supertest chỉ nhận header sau khi đã chọn method */
  const authed = (method: 'post', url: string) => api()[method](url).set('Authorization', `Bearer ${accessToken}`)

  /** Mã hiện tại của bí mật, sinh bằng đúng tham số mà API dùng */
  const codeFor = (totpSecret: string) =>
    new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      secret: OTPAuth.Secret.fromBase32(totpSecret),
    }).generate()

  const userState = () =>
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecret: true, twoFactorEnabled: true, twoFactorEnabledAt: true },
    })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    hashing = app.get(HashingService)

    // Tài khoản riêng cho spec này: bật 2FA trên tài khoản dùng chung là mọi spec khác đăng nhập hỏng.
    await prisma.user.deleteMany({ where: { email: EMAIL } })
    const role = await prisma.role.findFirstOrThrow({ select: { id: true } })
    const created = await prisma.user.create({
      data: {
        email: EMAIL,
        password: await hashing.hashPassword(PASSWORD),
        name: 'Nhân viên hai yếu tố',
        roleId: role.id,
        status: 'ACTIVE',
      },
      select: { id: true },
    })
    userId = created.id

    const login = await api().post('/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(201)
    accessToken = login.body.accessToken
  })

  afterAll(async () => {
    await prisma.verificationCode.deleteMany({ where: { email: EMAIL } })
    await prisma.loginAttempt.deleteMany({ where: { actorId: userId } })
    // Dòng `AuditLog` của tài khoản test CỐ Ý để lại: bảng đó append-only (trigger chặn DELETE), và
    // xoá được audit để dọn rác test là đúng thứ mà append-only sinh ra để chặn. Nó chỉ còn là một
    // `entityId` trỏ vào tài khoản đã xoá, không phải dữ liệu của ai.
    await prisma.refreshToken.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { email: EMAIL } })
    await app.close()
  })

  it('setup trả bí mật một lần, DB chỉ giữ bản mã hoá, và 2FA CHƯA bật', async () => {
    const res = await authed('post', '/auth/2fa/setup').expect(201)

    secret = res.body.secret
    expect(secret).toMatch(/^[A-Z2-7]+$/)
    expect(res.body.otpauthUri.startsWith('otpauth://totp/')).toBe(true)

    const state = await userState()
    expect(state.twoFactorEnabled).toBe(false)
    expect(state.totpSecret?.startsWith('v1:')).toBe(true)
    expect(state.totpSecret).not.toContain(secret)
  })

  it('mã sai thì không bật được', async () => {
    await authed('post', '/auth/2fa/enable').send({ totpCode: '000000' }).expect(422)
    expect((await userState()).twoFactorEnabled).toBe(false)
  })

  it('mã đúng thì bật, ghi mốc bật và để lại audit', async () => {
    await authed('post', '/auth/2fa/enable').send({ totpCode: codeFor(secret) }).expect(201)

    const state = await userState()
    expect(state.twoFactorEnabled).toBe(true)
    expect(state.twoFactorEnabledAt).not.toBeNull()

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'USER', entityId: userId, action: 'TWO_FACTOR_ENABLED' },
    })
    expect(audit).not.toBeNull()
  })

  it('đã bật thì mật khẩu đúng vẫn KHÔNG đủ để có token', async () => {
    const res = await api().post('/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(401)

    expect(res.body.message).toBe('Error.TwoFactorRequired')
    expect(res.body.accessToken).toBeUndefined()
  })

  it('mã sai thì 422 và tính vào bộ đếm sai', async () => {
    await api().post('/auth/login').send({ email: EMAIL, password: PASSWORD, totpCode: '000000' }).expect(422)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { failedAttempts: true } })
    expect(user.failedAttempts).toBeGreaterThan(0)
  })

  it('mã đúng thì cấp token và ghi SUCCESS', async () => {
    const res = await api()
      .post('/auth/login')
      .send({ email: EMAIL, password: PASSWORD, totpCode: codeFor(secret) })
      .expect(201)

    expect(res.body.accessToken).toBeTruthy()

    const newest = await prisma.loginAttempt.findFirst({
      where: { actorId: userId },
      orderBy: { id: 'desc' },
      select: { outcome: true },
    })
    expect(newest?.outcome).toBe('SUCCESS')
  })

  it('mất điện thoại vẫn vào được bằng OTP qua email', async () => {
    // Ghi thẳng dòng mã thay vì gọi /auth/otp: spec này kiểm đường đăng nhập, không kiểm việc gửi email.
    await prisma.verificationCode.create({
      data: {
        email: EMAIL,
        codeHash: hashOtpCode('654321'),
        type: 'LOGIN',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    })

    const res = await api().post('/auth/login').send({ email: EMAIL, password: PASSWORD, code: '654321' }).expect(201)

    expect(res.body.accessToken).toBeTruthy()
  })

  it('tắt 2FA: đúng mật khẩu nhưng thiếu yếu tố thứ hai thì không tắt', async () => {
    await authed('post', '/auth/2fa/disable').send({ password: PASSWORD }).expect(401)
    expect((await userState()).twoFactorEnabled).toBe(true)
  })

  it('tắt 2FA bằng mật khẩu + mã: xoá bí mật, để lại audit', async () => {
    await authed('post', '/auth/2fa/disable').send({ password: PASSWORD, totpCode: codeFor(secret) }).expect(201)

    const state = await userState()
    expect(state.twoFactorEnabled).toBe(false)
    expect(state.totpSecret).toBeNull()

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'USER', entityId: userId, action: 'TWO_FACTOR_DISABLED' },
    })
    expect(audit).not.toBeNull()
  })

  it('tắt rồi thì đăng nhập bằng mật khẩu lại đủ', async () => {
    await api().post('/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(201)
  })

  it('hai lần đăng nhập trong cùng một giây vẫn ra hai token khác nhau', async () => {
    // Trước đây payload refresh token không có `uuid`, nên hai token cấp trong cùng một giây là
    // MỘT chuỗi: lần thứ hai chết ở unique constraint `RefreshToken.tokenHash` — 500 ngay giữa luồng
    // đăng nhập, gặp bằng cách bấm đăng nhập hai lần.
    const [first, second] = await Promise.all([
      api().post('/auth/login').send({ email: EMAIL, password: PASSWORD }),
      api().post('/auth/login').send({ email: EMAIL, password: PASSWORD }),
    ])

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(first.body.refreshToken).not.toBe(second.body.refreshToken)
  })

  it('ba route 2FA không phải route công khai', async () => {
    await api().post('/auth/2fa/setup').expect(401)
    await api().post('/auth/2fa/enable').send({ totpCode: '000000' }).expect(401)
    await api().post('/auth/2fa/disable').send({ password: PASSWORD }).expect(401)
  })
})
