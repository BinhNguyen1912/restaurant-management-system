import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import * as OTPAuth from 'otpauth'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { TOTP_DIGITS, TOTP_PERIOD_SECONDS } from '../src/routes/auth/two-factor'
import envConfig from '../src/shared/config'
import { HashingService } from '../src/shared/service/hashing.service'
import { PrismaService } from '../src/shared/service/prisma.service'
import { resetTwoFactorForUser } from '../src/shared/service/two-factor-reset'

/**
 * Bắt buộc 2FA cho ADMIN/KE_TOAN, đi qua HTTP thật (prod-readiness §M9 mục 5).
 *
 * Điều phải chứng minh — không phải "đã thêm một guard":
 *  - mặc định (chưa đặt `TWO_FACTOR_ENFORCEMENT`) KHÔNG ai bị chặn: bật một rào chắn lên hệ thống
 *    đang chạy phải là hành động có chủ ý, không phải hệ quả của việc deploy;
 *  - bật lên thì ADMIN chưa có 2FA bị chặn ở mọi route (403 `Error.TwoFactorEnrolmentRequired`),
 *    kể cả route nhạy cảm — chặn TRƯỚC bước nhập lại mật khẩu, vì chưa đủ điều kiện để tới đó;
 *  - nhưng KHÔNG bị khoá ra ngoài: `/auth/2fa/setup` và `/auth/logout` vẫn mở. Đây là điểm khác
 *    biệt giữa "bắt buộc bật" và "tự khoá mình" — chặn ở cửa đăng nhập là không có đường tự mở;
 *  - bật 2FA xong, một lần `/auth/refresh-token` là hết bị chặn (token mới tính lại cờ từ DB),
 *    không phải đăng nhập lại giữa ca;
 *  - STAFF (ngoài diện) không bị ảnh hưởng.
 */
describe('Bắt buộc 2FA cho ADMIN/KE_TOAN (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let hashing: HashingService
  let jwtService: JwtService

  const EMAIL_ADMIN = 'bat-buoc-2fa-admin@order.com'
  const EMAIL_STAFF = 'bat-buoc-2fa-staff@order.com'
  const PASSWORD = '123456'
  let adminId: number
  let staffId: number
  const originalEnforcement = envConfig.TWO_FACTOR_ENFORCEMENT

  const api = () => request(app.getHttpServer())
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
  const claims = (token: string) => jwtService.decode(token) as { enrolmentRequired?: boolean; roleName?: string }

  const login = async (email: string, extra: Record<string, unknown> = {}) => {
    const res = await api()
      .post('/auth/login')
      .send({ email, password: PASSWORD, ...extra })
      .expect(201)
    return res.body as { accessToken: string; refreshToken: string }
  }

  const codeFor = (totpSecret: string) =>
    new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      secret: OTPAuth.Secret.fromBase32(totpSecret),
    }).generate()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    hashing = app.get(HashingService)
    jwtService = app.get(JwtService)

    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_ADMIN, EMAIL_STAFF] } } })
    const adminRole = await prisma.role.findFirstOrThrow({ where: { name: 'ADMIN' }, select: { id: true } })
    const staffRole = await prisma.role.findFirstOrThrow({ where: { name: 'STAFF' }, select: { id: true } })
    const password = await hashing.hashPassword(PASSWORD)

    const admin = await prisma.user.create({
      data: { email: EMAIL_ADMIN, password, name: 'Quản trị bắt buộc 2FA', roleId: adminRole.id, status: 'ACTIVE' },
      select: { id: true },
    })
    adminId = admin.id
    const staff = await prisma.user.create({
      data: { email: EMAIL_STAFF, password, name: 'Nhân viên ngoài diện', roleId: staffRole.id, status: 'ACTIVE' },
      select: { id: true },
    })
    staffId = staff.id
  })

  afterAll(async () => {
    // Trả lại giá trị cũ: các spec chạy sau trong CÙNG tiến trình không được thừa hưởng "bắt buộc bật".
    if (originalEnforcement === undefined) {
      delete (envConfig as { TWO_FACTOR_ENFORCEMENT?: 'off' | 'on' }).TWO_FACTOR_ENFORCEMENT
    } else {
      envConfig.TWO_FACTOR_ENFORCEMENT = originalEnforcement
    }
    await prisma.loginAttempt.deleteMany({ where: { actorId: { in: [adminId, staffId] } } })
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [adminId, staffId] } } })
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_ADMIN, EMAIL_STAFF] } } })
    await app.close()
  })

  it('chưa bật bắt buộc: ADMIN chưa có 2FA vẫn dùng hệ thống bình thường', async () => {
    delete (envConfig as { TWO_FACTOR_ENFORCEMENT?: 'off' | 'on' }).TWO_FACTOR_ENFORCEMENT

    const { accessToken } = await login(EMAIL_ADMIN)
    expect(claims(accessToken).enrolmentRequired).toBeFalsy()

    await api().get('/users').set(bearer(accessToken)).expect(200)
  })

  it('bật bắt buộc: phiên ADMIN chưa có 2FA bị chặn 403, kể cả route nhạy cảm', async () => {
    envConfig.TWO_FACTOR_ENFORCEMENT = 'on'

    const { accessToken } = await login(EMAIL_ADMIN)
    expect(claims(accessToken).enrolmentRequired).toBe(true)

    const list = await api().get('/users').set(bearer(accessToken)).expect(403)
    expect(list.body.message).toBe('Error.TwoFactorEnrolmentRequired')

    // Route nhạy cảm: chặn ở bước enrolment TRƯỚC bước "nhập lại mật khẩu" — 403 chứ không phải 401.
    const sensitive = await api().post('/role').set(bearer(accessToken)).send({}).expect(403)
    expect(sensitive.body.message).toBe('Error.TwoFactorEnrolmentRequired')
  })

  it('nhưng không khoá người dùng ra ngoài: setup và logout vẫn mở', async () => {
    envConfig.TWO_FACTOR_ENFORCEMENT = 'on'

    const { accessToken, refreshToken } = await login(EMAIL_ADMIN)
    await api().post('/auth/2fa/setup').set(bearer(accessToken)).expect(201)
    // Refresh-token là đường lấy lại token đầy đủ sau khi bật xong, nên nó cũng phải gọi được —
    // route này công khai (xác thực bằng chính refresh token trong body).
    await api().post('/auth/refresh-token').send({ refreshToken }).expect(201)
    await api().post('/auth/logout').send({ refreshToken }).set(bearer(accessToken)).expect(201)
  })

  it('bật 2FA xong + một lần refresh-token là hết bị chặn, không phải đăng nhập lại', async () => {
    envConfig.TWO_FACTOR_ENFORCEMENT = 'on'

    const first = await login(EMAIL_ADMIN)
    const setup = await api().post('/auth/2fa/setup').set(bearer(first.accessToken)).expect(201)
    await api()
      .post('/auth/2fa/enable')
      .set(bearer(first.accessToken))
      .send({ totpCode: codeFor(setup.body.secret) })
      .expect(201)

    // Token cũ vẫn mang cờ (cấp trước khi bật) — đúng như thiết kế: cờ tính lúc cấp, không tra DB mỗi request.
    await api().get('/users').set(bearer(first.accessToken)).expect(403)

    const renewed = await api().post('/auth/refresh-token').send({ refreshToken: first.refreshToken }).expect(201)
    expect(claims(renewed.body.accessToken).enrolmentRequired).toBeFalsy()
    await api().get('/users').set(bearer(renewed.body.accessToken)).expect(200)

    // Và từ lần đăng nhập sau, tài khoản này đã có 2FA nên không còn bị coi là thiếu.
    const second = await login(EMAIL_ADMIN, { totpCode: codeFor(setup.body.secret) })
    expect(claims(second.accessToken).enrolmentRequired).toBeFalsy()
  })

  it('người mất thiết bị: reset xoá 2FA, thu hồi mọi refresh token, ghi AuditLog cùng transaction', async () => {
    envConfig.TWO_FACTOR_ENFORCEMENT = 'on'

    // Trạng thái vào: ADMIN đang BẬT 2FA (từ test trên) và đang có refresh token sống.
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: adminId },
      select: { twoFactorEnabled: true, totpSecret: true },
    })
    expect(before.twoFactorEnabled).toBe(true)
    expect(await prisma.refreshToken.count({ where: { userId: adminId, revokedAt: null } })).toBeGreaterThan(0)

    // Chạy thử trước: đường tháo rào chắn cao nhất trong hệ thống mà sửa dữ liệu ngay khi gõ sai
    // email là mở toang tài khoản người khác, nên mặc định phải là "chỉ in ra".
    const dry = await resetTwoFactorForUser(prisma, {
      email: EMAIL_ADMIN,
      actorEmail: EMAIL_STAFF,
      reason: 'mất điện thoại, đã xác minh CCCD',
      apply: false,
    })
    expect(dry.status).toBe('DRY_RUN')
    const untouched = await prisma.user.findUniqueOrThrow({
      where: { id: adminId },
      select: { twoFactorEnabled: true, totpSecret: true },
    })
    expect(untouched.twoFactorEnabled).toBe(true)
    expect(untouched.totpSecret).toBe(before.totpSecret)

    // Thiếu lý do / thiếu người làm: từ chối TRƯỚC khi đụng DB.
    await expect(
      resetTwoFactorForUser(prisma, { email: EMAIL_ADMIN, actorEmail: EMAIL_STAFF, reason: '  ', apply: true }),
    ).rejects.toThrow()
    await expect(
      resetTwoFactorForUser(prisma, { email: EMAIL_ADMIN, actorEmail: '  ', reason: 'mất máy', apply: true }),
    ).rejects.toThrow()

    const applied = await resetTwoFactorForUser(prisma, {
      email: EMAIL_ADMIN,
      actorEmail: EMAIL_STAFF,
      reason: 'mất điện thoại, đã xác minh CCCD',
      apply: true,
    })
    expect(applied.status).toBe('APPLIED')
    if (applied.status !== 'APPLIED') throw new Error('reset phải áp dụng thật')
    expect(applied.revokedRefreshTokens).toBeGreaterThan(0)

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: adminId },
      select: { twoFactorEnabled: true, totpSecret: true, twoFactorEnabledAt: true },
    })
    expect(after.twoFactorEnabled).toBe(false)
    expect(after.totpSecret).toBeNull()
    expect(after.twoFactorEnabledAt).toBeNull()
    // Thiết bị có thể đã rơi vào tay người khác: mọi phiên khác phải đăng nhập lại.
    expect(await prisma.refreshToken.count({ where: { userId: adminId, revokedAt: null } })).toBe(0)

    // Bằng chứng: ai xoá, của ai, vì sao — cả ba vế trong một dòng, ghi cùng transaction với bước sửa.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'TWO_FACTOR_RESET', entityType: 'USER', entityId: adminId },
      orderBy: { id: 'desc' },
    })
    expect(audit.actorId).toBe(staffId)
    expect(audit.reason).toBe('mất điện thoại, đã xác minh CCCD')
    expect(audit.before).toEqual({ twoFactorEnabled: true, hadPendingSecret: true })
    expect(audit.after).toMatchObject({ twoFactorEnabled: false, hadPendingSecret: false })

    // Và tài khoản trở lại đúng trạng thái "phải bật 2FA trước": đăng nhập được, nhưng chỉ còn ba cửa.
    const relogin = await login(EMAIL_ADMIN)
    expect(claims(relogin.accessToken).enrolmentRequired).toBe(true)
    const blocked = await api().get('/users').set(bearer(relogin.accessToken)).expect(403)
    expect(blocked.body.message).toBe('Error.TwoFactorEnrolmentRequired')
  })

  it('STAFF ngoài diện: không bị chặn, chỉ bị kiểm quyền như thường', async () => {
    envConfig.TWO_FACTOR_ENFORCEMENT = 'on'

    const { accessToken } = await login(EMAIL_STAFF)
    expect(claims(accessToken).enrolmentRequired).toBeFalsy()

    // 403 ở đây là Error.PermissionDenied (STAFF không có quyền USERS), KHÔNG phải lỗi enrolment —
    // tức là guard đã cho request đi qua tới bước kiểm quyền.
    const res = await api().get('/users').set(bearer(accessToken)).expect(403)
    expect(res.body.message).not.toBe('Error.TwoFactorEnrolmentRequired')
  })
})
