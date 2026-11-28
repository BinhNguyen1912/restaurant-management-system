import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { emailFingerprint } from '../src/routes/auth/login-attempt'
import { HashingService } from '../src/shared/service/hashing.service'
import { PrismaService } from '../src/shared/service/prisma.service'

/**
 * Nhật ký THỬ ĐĂNG NHẬP (`LoginAttempt`).
 *
 * Điều phải chứng minh, không phải "đã thêm bảng":
 *  - đăng nhập đúng và sai đều để lại dấu — trước đây chỉ có một dòng khi tài khoản ĐÃ bị khoá, tức
 *    là giai đoạn dò (4 lần đầu) hoàn toàn vô hình;
 *  - thử vào email KHÔNG tồn tại vẫn ghi (không gắn được tài khoản nào) — đó chính là màn dò xem địa
 *    chỉ nào có trong hệ thống, thứ mà cơ chế khoá theo tài khoản không bao giờ thấy;
 *  - đang bị khoá mà vẫn thử thì vẫn ghi: tiếp tục thử trong lúc khoá là dấu hiệu, không phải nhiễu;
 *  - cột định danh chỉ chứa hash 64 hex — email thô không được xuất hiện trong bảng;
 *  - nhật ký không sửa được (trigger DB).
 */
describe('Nhật ký thử đăng nhập (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let hashing: HashingService
  let tempUserId: number

  const ADMIN_EMAIL = 'admin@order.com'
  const TEMP_EMAIL = 'nhat-ky-thu@order.com'
  const TEMP_PASSWORD = '123456'
  const UNKNOWN_EMAIL = 'khong-ton-tai@order.com'

  const api = () => request(app.getHttpServer())
  const login = (email: string, password: string) => api().post('/auth/login').send({ email, password })

  /** Các dòng nhật ký của một định danh, mới nhất trước */
  const attemptsOf = (email: string) =>
    prisma.loginAttempt.findMany({ where: { emailHash: emailFingerprint(email) }, orderBy: { id: 'desc' } })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    hashing = app.get(HashingService)

    // Nhân viên dùng riêng cho spec này: thử sai trên tài khoản admin sẽ đẩy bộ đếm khoá của admin
    // lên, và spec chạy song song khác sẽ đăng nhập hỏng theo.
    await prisma.user.deleteMany({ where: { email: TEMP_EMAIL } })
    const role = await prisma.role.findFirstOrThrow({ select: { id: true } })
    const created = await prisma.user.create({
      data: {
        email: TEMP_EMAIL,
        password: await hashing.hashPassword(TEMP_PASSWORD),
        name: 'Nhân viên thử nhật ký',
        roleId: role.id,
        status: 'ACTIVE',
      },
      select: { id: true },
    })
    tempUserId = created.id
  })

  afterAll(async () => {
    await prisma.loginAttempt.deleteMany({ where: { actorId: tempUserId } })
    await prisma.user.deleteMany({ where: { email: TEMP_EMAIL } })
    await app.close()
  })

  it('đăng nhập đúng ghi SUCCESS kèm tài khoản và IP', async () => {
    await login(TEMP_EMAIL, TEMP_PASSWORD).expect(201)

    const [row] = await attemptsOf(TEMP_EMAIL)
    expect(row).toMatchObject({ actorId: tempUserId, outcome: 'SUCCESS' })
    expect(row.ip).toBeTruthy()
  })

  it('sai mật khẩu ghi FAILED, không ghi SUCCESS', async () => {
    const before = (await attemptsOf(TEMP_EMAIL)).length

    await login(TEMP_EMAIL, 'sai-mat-khau').expect(422)

    const rows = await attemptsOf(TEMP_EMAIL)
    expect(rows).toHaveLength(before + 1)
    expect(rows[0]).toMatchObject({ actorId: tempUserId, outcome: 'FAILED', ip: expect.any(String) })
  })

  it('email không tồn tại vẫn ghi, nhưng không gắn cho tài khoản nào', async () => {
    await login(UNKNOWN_EMAIL, TEMP_PASSWORD).expect(422)

    const [row] = await attemptsOf(UNKNOWN_EMAIL)
    expect(row).toMatchObject({ actorId: null, outcome: 'FAILED' })

    await prisma.loginAttempt.deleteMany({ where: { emailHash: emailFingerprint(UNKNOWN_EMAIL) } })
  })

  it('đang bị khoá mà vẫn thử thì vẫn ghi nhận lần thử', async () => {
    const before = (await attemptsOf(TEMP_EMAIL)).length
    await prisma.user.update({ where: { id: tempUserId }, data: { lockedUntil: new Date(Date.now() + 60_000) } })

    await login(TEMP_EMAIL, TEMP_PASSWORD).expect(423)

    const rows = await attemptsOf(TEMP_EMAIL)
    expect(rows).toHaveLength(before + 1)
    expect(rows[0]).toMatchObject({ actorId: tempUserId, outcome: 'FAILED' })

    await prisma.user.update({ where: { id: tempUserId }, data: { lockedUntil: null, failedAttempts: 0 } })
  })

  it('cột định danh chỉ chứa hash: không có email thô trong bảng', async () => {
    await login(TEMP_EMAIL, 'sai-mat-khau').expect(422)

    const rows = await attemptsOf(TEMP_EMAIL)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.emailHash).toMatch(/^[0-9a-f]{64}$/)
    }
    // Toàn bộ bảng: email thô của lần thử không được xuất hiện ở bất kỳ cột nào
    const everything = await prisma.loginAttempt.findMany({ where: { actorId: tempUserId } })
    expect(JSON.stringify(everything)).not.toContain(TEMP_EMAIL)
    // và hash thì KHÔNG phải email viết thường (không lưu dạng "gần thô")
    expect(rows[0].emailHash).not.toBe(TEMP_EMAIL)
  })

  it('trigger DB chặn sửa nhật ký', async () => {
    const [row] = await attemptsOf(TEMP_EMAIL)

    await expect(
      prisma.$executeRaw`UPDATE "LoginAttempt" SET "outcome" = 'SUCCESS' WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/append-only/i)
  })

  it('admin đăng nhập đúng vẫn ghi nhật ký với tài khoản thật', async () => {
    await login(ADMIN_EMAIL, '123456').expect(201)

    const [row] = await attemptsOf(ADMIN_EMAIL)
    expect(row).toMatchObject({ outcome: 'SUCCESS' })
    expect(row.actorId).toBeTruthy()
  })
})
