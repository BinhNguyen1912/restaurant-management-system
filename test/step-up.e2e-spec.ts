import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import * as OTPAuth from 'otpauth'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { TOTP_DIGITS, TOTP_PERIOD_SECONDS } from '../src/routes/auth/two-factor'
import { HashingService } from '../src/shared/service/hashing.service'
import { PrismaService } from '../src/shared/service/prisma.service'

/**
 * Nhập lại mật khẩu trước thao tác nhạy cảm (step-up), đi qua HTTP thật.
 *
 * Điều phải chứng minh — không phải "đã thêm một route":
 *  - thao tác nhạy cảm (tạo vai trò, sửa quyền, xoá tài khoản) **không** làm được chỉ với access
 *    token: thiếu vé là 401 `Error.StepUpRequired`, không phải 403 (403 là "không có quyền" — FE
 *    phải phân biệt được hai thứ này);
 *  - route thường **không** bị ảnh hưởng: một guard đòi vé ở mọi chỗ là guard sai;
 *  - `/auth/reauth` đúng mật khẩu mới cấp vé, và vé **không** phải một phiên đăng nhập thứ hai
 *    (không dùng được như Bearer token, sống 5 phút);
 *  - vé của NGƯỜI KHÁC không mở khoá được;
 *  - tài khoản đã bật 2FA thì reauth cũng phải qua yếu tố thứ hai.
 */
describe('Step-up: nhập lại mật khẩu cho thao tác nhạy cảm (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let hashing: HashingService

  const EMAIL_A = 'step-up-a@order.com'
  const EMAIL_B = 'step-up-b@order.com'
  const PASSWORD = '123456'
  const ROLE_NAME = 'STEP_UP_E2E_ROLE'

  let userIdA: number
  let userIdB: number
  let accessTokenA: string
  let accessTokenB: string
  let stepUpTokenA: string
  let stepUpTokenB: string

  const api = () => request(app.getHttpServer())
  const asA = (method: 'post' | 'get' | 'put' | 'delete', url: string, stepUp?: string) => {
    const req = api()[method](url).set('Authorization', `Bearer ${accessTokenA}`)
    return stepUp ? req.set('x-step-up-token', stepUp) : req
  }
  const asB = (method: 'post', url: string, stepUp?: string) => {
    const req = api()[method](url).set('Authorization', `Bearer ${accessTokenB}`)
    return stepUp ? req.set('x-step-up-token', stepUp) : req
  }
  const roleBody = { name: ROLE_NAME, description: 'vai trò do spec step-up tạo', isActive: true }

  const codeFor = (totpSecret: string) =>
    new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      secret: OTPAuth.Secret.fromBase32(totpSecret),
    }).generate()

  const makeUser = async (email: string, name: string) => {
    const role = await prisma.role.findFirstOrThrow({ where: { name: 'ADMIN' }, select: { id: true } })
    const user = await prisma.user.create({
      data: {
        email,
        password: await hashing.hashPassword(PASSWORD),
        name,
        roleId: role.id,
        status: 'ACTIVE',
      },
      select: { id: true },
    })
    return user.id
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    hashing = app.get(HashingService)

    await cleanup()
    userIdA = await makeUser(EMAIL_A, 'Nhân viên step-up A')
    userIdB = await makeUser(EMAIL_B, 'Nhân viên step-up B')

    accessTokenA = (await api().post('/auth/login').send({ email: EMAIL_A, password: PASSWORD }).expect(201)).body
      .accessToken
    accessTokenB = (await api().post('/auth/login').send({ email: EMAIL_B, password: PASSWORD }).expect(201)).body
      .accessToken
  })

  async function cleanup() {
    // Tra id qua email chứ không dùng biến `userIdA/B`: `cleanup()` còn được gọi trong `beforeAll`,
    // lúc hai biến đó chưa có giá trị — Prisma nhận `undefined` trong `in` là lỗi serialize.
    const existing = await prisma.user.findMany({
      where: { email: { in: [EMAIL_A, EMAIL_B] } },
      select: { id: true },
    })
    const ids = existing.map((user) => user.id)

    await prisma.role.deleteMany({ where: { name: { in: [ROLE_NAME, `${ROLE_NAME}_2`, `${ROLE_NAME}_3`] } } })
    await prisma.verificationCode.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } })
    if (ids.length > 0) {
      await prisma.loginAttempt.deleteMany({ where: { actorId: { in: ids } } })
      await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } })
    }
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } })
  }

  afterAll(async () => {
    await cleanup()
    await app.close()
  })

  it('thao tác nhạy cảm chỉ có access token ⇒ 401 Error.StepUpRequired (không phải 403)', async () => {
    const res = await asA('post', '/role').send(roleBody)

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Error.StepUpRequired')
    // và không có vai trò nào được tạo
    expect(await prisma.role.count({ where: { name: ROLE_NAME } })).toBe(0)
  })

  it('route thường không bị đòi vé (guard không khoá cả hệ thống)', async () => {
    const res = await asA('get', '/users')

    expect(res.status).toBe(200)
  })

  it('/auth/reauth sai mật khẩu ⇒ 422 và không cấp vé', async () => {
    const res = await asA('post', '/auth/reauth').send({ password: 'sai-mat-khau' })

    expect(res.status).toBe(422)
    expect(res.body.stepUpToken).toBeUndefined()
  })

  it('/auth/reauth đúng ⇒ cấp vé ngắn hạn', async () => {
    const res = await asA('post', '/auth/reauth').send({ password: PASSWORD })

    expect(res.status).toBe(201)
    expect(typeof res.body.stepUpToken).toBe('string')
    // hạn 5 phút, không phải một phiên thứ hai
    const minutesLeft = (new Date(res.body.expiresAt).getTime() - Date.now()) / 60000
    expect(minutesLeft).toBeGreaterThan(0)
    expect(minutesLeft).toBeLessThanOrEqual(5)
    stepUpTokenA = res.body.stepUpToken
  })

  it('vé hợp lệ mở khoá được thao tác nhạy cảm', async () => {
    const res = await asA('post', '/role', stepUpTokenA).send(roleBody)

    expect(res.status).toBe(201)
    expect(await prisma.role.count({ where: { name: ROLE_NAME } })).toBe(1)
  })

  it('vé rác ⇒ 401 Error.StepUpInvalid', async () => {
    const res = await asA('post', '/role', 'khong-phai-ve').send({ ...roleBody, name: `${ROLE_NAME}_2` })

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Error.StepUpInvalid')
    expect(await prisma.role.count({ where: { name: `${ROLE_NAME}_2` } })).toBe(0)
  })

  it('vé của NGƯỜI KHÁC không mở khoá được', async () => {
    const minted = await asB('post', '/auth/reauth').send({ password: PASSWORD }).expect(201)
    stepUpTokenB = minted.body.stepUpToken

    const res = await asA('post', '/role', stepUpTokenB).send({ ...roleBody, name: `${ROLE_NAME}_3` })

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Error.StepUpInvalid')
    expect(await prisma.role.count({ where: { name: `${ROLE_NAME}_3` } })).toBe(0)
  })

  it('vé step-up KHÔNG dùng được như access token', async () => {
    const res = await api().get('/users').set('Authorization', `Bearer ${stepUpTokenA}`)

    expect(res.status).toBe(401)
  })

  it('tài khoản đã bật 2FA: reauth cũng phải qua yếu tố thứ hai', async () => {
    const setup = await asB('post', '/auth/2fa/setup').expect(201)
    const totpSecret = setup.body.secret as string
    await asB('post', '/auth/2fa/enable').send({ totpCode: codeFor(totpSecret) }).expect(201)

    const withoutCode = await asB('post', '/auth/reauth').send({ password: PASSWORD })
    expect(withoutCode.status).toBe(401)
    expect(withoutCode.body.message).toBe('Error.TwoFactorRequired')

    const wrongCode = await asB('post', '/auth/reauth').send({ password: PASSWORD, totpCode: '000000' })
    expect(wrongCode.status).toBe(422)

    const withCode = await asB('post', '/auth/reauth').send({ password: PASSWORD, totpCode: codeFor(totpSecret) })
    expect(withCode.status).toBe(201)
    expect(typeof withCode.body.stepUpToken).toBe('string')
  })
})
