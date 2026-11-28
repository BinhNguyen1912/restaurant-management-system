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
 *    gắn bừa cho một người nào;
 *  - chủ thể không chỉ có khách: đọc hồ sơ NHÂN VIÊN phải ghi `USER`, không nhầm sang `CUSTOMER` —
 *    nhầm thì nhật ký buộc tội sai người và cùng lúc mất dấu vết thật;
 *  - request hỏng (404) không sinh dòng rác, và thao tác GHI không bị ghi thành "truy cập";
 *  - nhật ký không sửa được (trigger DB) và không có nửa cặp (CHECK), tức vẫn là bằng chứng;
 *  - nội dung ghi chú KHÔNG bị chép vào `AuditLog`: nếu chép thì script ẩn danh hoá thành vô nghĩa,
 *    vì bản sao PII nằm ở một bảng không xoá được.
 */
describe('Access log PII & note audit (e2e)', () => {
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

  /** đếm số dòng của một route để so trước/sau, không phụ thuộc dữ liệu cũ trong DB dev */
  const countRoute = (route: string) => prisma.accessLog.count({ where: { route } })

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

    const rows = await prisma.accessLog.findMany({ where: { subjectType: 'CUSTOMER', subjectId: customerId } })
    const detailRows = rows.filter((row) => row.route === 'GET /customers/:id')
    expect(detailRows).toHaveLength(1)
    expect(detailRows[0]).toMatchObject({
      route: 'GET /customers/:id',
      subjectType: 'CUSTOMER',
      subjectId: customerId,
      actorId: adminId,
      actorRole: 'ADMIN',
      resultCount: 1,
    })
    expect(detailRows[0].ip).toBeTruthy()
  })

  it('đọc cả trang danh sách thì ghi số bản ghi, KHÔNG gắn cho một khách nào', async () => {
    const res = await api().get('/customers').query({ search: PHONE }).set(auth()).expect(200)
    const returned = res.body.data.length
    expect(returned).toBe(1)

    // Tra theo SĐT (chính là PII) không được chép vào nhật ký, nên chỉ còn cách nhận diện dòng vừa
    // ghi bằng combination route + số bản ghi.
    const rows = await prisma.accessLog.findMany({ where: { route: 'GET /customers', resultCount: returned } })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.subjectType === null && row.subjectId === null)).toBe(true)
    expect(rows.every((row) => row.actorId === adminId)).toBe(true)
  })

  it('request hỏng không sinh dòng nhật ký', async () => {
    const missingId = 99_999_999
    await api().get(`/customers/${missingId}`).set(auth()).expect(404)
    expect(await prisma.accessLog.count({ where: { subjectId: missingId } })).toBe(0)
  })

  it('sửa ghi chú KHÔNG bị ghi thành một lần truy cập', async () => {
    await api().patch(`/customers/${customerId}/note`).set(auth()).send({ note: NOTE }).expect(200)
    expect(await prisma.accessLog.count({ where: { subjectId: customerId, route: 'PATCH /customers/:id/note' } })).toBe(0)
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
    const row = await prisma.accessLog.findFirstOrThrow({ where: { subjectId: customerId }, select: { id: true } })
    await expect(
      prisma.accessLog.update({ where: { id: row.id }, data: { route: 'GET /khong-phai-toi' } }),
    ).rejects.toThrow(/append-only/)
  })

  it('DB không cho nửa cặp chủ thể (có type mà thiếu id)', async () => {
    // Code đã cố ý không set nửa cặp; test này chứng minh nếu có ai viết sai thì DB chặn, chứ không
    // phải tin vào việc "code nhớ set đủ hai cột"
    await expect(prisma.accessLog.create({ data: { route: 'GET /x', subjectType: 'CUSTOMER' } })).rejects.toThrow(
      /AccessLog_subject_pair_check/,
    )
  })

  describe('route đọc PII ngoài module khách', () => {
    it('hồ sơ NHÂN VIÊN ghi chủ thể USER, không lẫn sang khách', async () => {
      const before = await prisma.accessLog.count({ where: { route: 'GET /users/:userId', subjectId: adminId } })
      await api().get(`/users/${adminId}`).set(auth()).expect(200)

      const rows = await prisma.accessLog.findMany({
        where: { route: 'GET /users/:userId', subjectType: 'USER', subjectId: adminId },
        orderBy: { id: 'desc' },
      })
      expect(rows).toHaveLength(before + 1)
      expect(rows[0]).toMatchObject({ actorId: adminId, actorRole: 'ADMIN', resultCount: 1 })
    })

    it('danh sách nhân viên ghi route nhưng không gắn chủ thể', async () => {
      const before = await countRoute('GET /users')
      await api().get('/users').set(auth()).expect(200)
      expect(await countRoute('GET /users')).toBe(before + 1)
      const row = await prisma.accessLog.findFirstOrThrow({ where: { route: 'GET /users' }, orderBy: { id: 'desc' } })
      expect(row.subjectType).toBeNull()
      expect(row.resultCount).toBeGreaterThan(0)
    })

    it('danh sách đặt bàn (tên + SĐT khách) được ghi', async () => {
      const before = await countRoute('GET /reservation/listReservation')
      await api().get('/reservation/listReservation').set(auth()).expect(200)
      expect(await countRoute('GET /reservation/listReservation')).toBe(before + 1)
    })

    it('đọc bằng POST vẫn là một lần đọc: /orders/lists được ghi', async () => {
      const before = await countRoute('POST /orders/lists')
      await api().post('/orders/lists').set(auth()).send({}).expect(201)
      expect(await countRoute('POST /orders/lists')).toBe(before + 1)
    })

    it('danh sách khách của bàn (tên người ngồi) được ghi', async () => {
      const before = await countRoute('GET /guest/listGuests')
      await api().get('/guest/listGuests').set(auth()).expect(200)
      expect(await countRoute('GET /guest/listGuests')).toBe(before + 1)
    })
  })
})
