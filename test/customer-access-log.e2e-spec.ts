import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/service/prisma.service'

/**
 * Nhật ký TRUY CẬP dữ liệu cá nhân (NĐ 13/2023/NĐ-CP, Điều 26) và audit khi sửa ghi chú khách.
 *
 * Điều phải chứng minh không phải "đã thêm bảng" mà là:
 *  - đọc hồ sơ nào thì nhật ký ghi ĐÚNG hồ sơ đó (kèm người đọc), đọc cả trang danh sách thì không
 *    gắn bừa cho một khách nào;
 *  - request hỏng (404) không sinh dòng rác, và thao tác GHI không bị ghi thành "truy cập";
 *  - nhật ký không sửa được (trigger DB), tức vẫn là bằng chứng;
 *  - nội dung ghi chú KHÔNG bị chép vào `AuditLog`: nếu chép thì script ẩn danh hoá thành vô nghĩa,
 *    vì bản sao PII nằm ở một bảng không xoá được.
 */
describe('Customer access log & note audit (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let token: string
  let adminId: number
  let customerId: number

  const PHONE = '0999111222'
  /** Ghi chú cố tình chứa SĐT khác + nội dung sức khoẻ: đúng loại dữ liệu không được chép vào log */
  const NOTE = 'Khách dị ứng hải sản, gọi trước 30 phút — liên hệ 0912345678'

  const api = () => request(app.getHttpServer())
  const auth = () => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)

    const login = await api().post('/auth/login').send({ email: 'admin@order.com', password: '123456' }).expect(201)
    token = login.body.accessToken

    const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@order.com' }, select: { id: true } })
    adminId = admin.id

    // Dọn dấu vết lần chạy trước (nếu lần trước chết giữa chừng)
    await prisma.customer.deleteMany({ where: { phone: PHONE } })
    const customer = await prisma.customer.create({
      data: { phone: PHONE, name: 'Khách Kiểm Tra Nhật Ký' },
      select: { id: true },
    })
    customerId = customer.id
  })

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { phone: PHONE } })
    await app.close()
  })

  it('đọc một hồ sơ thì nhật ký ghi đúng hồ sơ, người đọc và IP', async () => {
    await api().get(`/customers/${customerId}`).set(auth()).expect(200)

    const rows = await prisma.accessLog.findMany({ where: { customerId, route: 'GET /customers/:id' } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      route: 'GET /customers/:id',
      customerId,
      actorId: adminId,
      actorRole: 'ADMIN',
      resultCount: 1,
    })
    expect(rows[0].ip).toBeTruthy()
  })

  it('đọc cả trang danh sách thì ghi số bản ghi, KHÔNG gắn cho một khách nào', async () => {
    const res = await api().get('/customers').query({ search: PHONE }).set(auth()).expect(200)
    const returned = res.body.data.length
    expect(returned).toBe(1)

    // Tra theo SĐT (chính là PII) không được chép vào nhật ký, nên chỉ còn cách nhận diện dòng vừa
    // ghi bằng combination route + số bản ghi.
    const rows = await prisma.accessLog.findMany({ where: { route: 'GET /customers', resultCount: returned } })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.customerId === null)).toBe(true)
    expect(rows.every((row) => row.actorId === adminId)).toBe(true)
  })

  it('request hỏng không sinh dòng nhật ký', async () => {
    const missingId = 99_999_999
    await api().get(`/customers/${missingId}`).set(auth()).expect(404)
    expect(await prisma.accessLog.count({ where: { customerId: missingId } })).toBe(0)
  })

  it('sửa ghi chú KHÔNG bị ghi thành một lần truy cập', async () => {
    await api().patch(`/customers/${customerId}/note`).set(auth()).send({ note: NOTE }).expect(200)
    expect(await prisma.accessLog.count({ where: { customerId, route: 'PATCH /customers/:id/note' } })).toBe(0)
  })

  it('audit sửa ghi chú chỉ giữ độ dài, không chép nội dung (PII)', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: 'CUSTOMER', entityId: customerId, action: 'CUSTOMER_NOTE_UPDATED' },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].actorId).toBe(adminId)
    expect(rows[0].after).toMatchObject({ hasNote: true, length: NOTE.length })
    // Nội dung ghi chú (và SĐT trong đó) không được nằm trong nhật ký append-only
    const serialized = JSON.stringify(rows[0].before) + JSON.stringify(rows[0].after)
    expect(serialized).not.toContain('0912345678')
    expect(serialized).not.toContain('dị ứng')
  })

  it('lưu lại ghi chú y nguyên thì không thêm dòng audit (nhật ký chỉ dài khi có chuyện thật)', async () => {
    await api().patch(`/customers/${customerId}/note`).set(auth()).send({ note: NOTE }).expect(200)
    const rows = await prisma.auditLog.count({
      where: { entityType: 'CUSTOMER', entityId: customerId, action: 'CUSTOMER_NOTE_UPDATED' },
    })
    expect(rows).toBe(1)
  })

  it('nhật ký truy cập là append-only: không UPDATE được', async () => {
    const row = await prisma.accessLog.findFirstOrThrow({ where: { customerId }, select: { id: true } })
    await expect(
      prisma.accessLog.update({ where: { id: row.id }, data: { route: 'GET /khong-phai-toi' } }),
    ).rejects.toThrow(/append-only/)
  })
})
