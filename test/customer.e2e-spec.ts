import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/service/prisma.service'
import { CustomerRepo } from '../src/routes/customer/customer.repo'

/**
 * Hồ sơ khách hàng (e2e thật: supertest + AppModule + DB dev).
 *
 * Điều quan trọng nhất cần chứng minh không phải "endpoint trả 200" mà là **nhận diện khách**:
 * cùng một SĐT gõ theo ba kiểu khác nhau phải ra MỘT hồ sơ, và số liệu chi tiêu phải khớp với
 * đơn đã thu tiền thật trong DB.
 */
describe('Customer (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let repo: CustomerRepo
  let token: string
  let branchId: number
  let customerId: number
  let orderId: number
  let paymentId: number

  /** SĐT giả, không trùng dữ liệu dev; gõ có dấu cách để kiểm luôn bước chuẩn hoá. */
  const PHONE_PRETTY = '0999 000 111'
  const PHONE_NORMALIZED = '0999000111'
  const SPEND = 250_000

  const api = () => request(app.getHttpServer())
  const auth = () => ({ Authorization: `Bearer ${token}` })
  /** ngày hôm nay theo giờ VN — báo cáo cắt kỳ theo ngày VN, không phải UTC */
  const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    repo = app.get(CustomerRepo)

    const login = await api().post('/auth/login').send({ email: 'admin@order.com', password: '123456' }).expect(201)
    token = login.body.accessToken

    const branch = await prisma.branch.findFirstOrThrow({ where: { isActive: true }, select: { id: true } })
    branchId = branch.id

    // Dọn dấu vết lần chạy trước (nếu lần trước chết giữa chừng)
    await prisma.order.deleteMany({ where: { customer: { phone: PHONE_NORMALIZED } } })
    await prisma.customer.deleteMany({ where: { phone: PHONE_NORMALIZED } })
  })

  afterAll(async () => {
    if (orderId) await prisma.order.deleteMany({ where: { id: orderId } })
    if (paymentId) await prisma.payment.deleteMany({ where: { id: paymentId } })
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } })
    await app.close()
  })

  it('gộp nhiều cách gõ SĐT về một hồ sơ và không xoá tên khi lượt sau bỏ trống', async () => {
    customerId = await prisma.$transaction((tx) =>
      repo.upsertProfile(tx, { phone: PHONE_PRETTY, name: 'Khách Test' }),
    )
    const sameId = await prisma.$transaction((tx) => repo.upsertProfile(tx, { phone: '+84999000111', name: '   ' }))

    expect(sameId).toBe(customerId)
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })
    expect(row.phone).toBe(PHONE_NORMALIZED)
    expect(row.name).toBe('Khách Test')
  })

  it('SĐT rác không tạo hồ sơ (thà thiếu còn hơn gộp nhầm hai người)', async () => {
    const before = await prisma.customer.count()
    await expect(prisma.$transaction((tx) => repo.upsertProfile(tx, { phone: '0901', name: 'Rác' }))).rejects.toThrow()
    expect(await prisma.customer.count()).toBe(before)
  })

  it('số liệu hồ sơ đọc từ đơn ĐÃ THU TIỀN thật trong DB', async () => {
    const payment = await prisma.payment.create({
      data: { status: 'SUCCESS', amount: SPEND, branchId },
      select: { id: true },
    })
    paymentId = payment.id
    const order = await prisma.order.create({
      data: {
        customerId,
        paymentId,
        status: 'PAID',
        branchId,
        subtotal: SPEND,
        grandTotal: SPEND,
      },
      select: { id: true },
    })
    orderId = order.id

    const list = await api().get('/customers').query({ search: PHONE_PRETTY }).set(auth()).expect(200)
    expect(list.body.totalItems).toBe(1)
    const [customer] = list.body.data
    expect(customer.id).toBe(customerId)
    expect(customer.stats.orderCount).toBe(1)
    expect(customer.stats.totalSpend).toBe(SPEND)
    expect(customer.stats.avgSpend).toBe(SPEND)
    expect(customer.stats.lastVisitAt).not.toBeNull()

    const detail = await api().get(`/customers/${customerId}`).set(auth()).expect(200)
    expect(detail.body.data.recentOrders[0]).toMatchObject({
      id: orderId,
      grandTotal: SPEND,
      branchName: expect.any(String),
    })
  })

  it('báo cáo phân biệt khách mới với khách quay lại', async () => {
    const today = vnToday()
    const report = await api()
      .get('/customers/report/overview')
      .query({ fromDate: today, toDate: today, branchId })
      .set(auth())
      .expect(200)

    expect(report.body.data.fromDate).toBe(today)
    expect(report.body.data.activeCustomers).toBeGreaterThanOrEqual(1)
    expect(report.body.data.newCustomers).toBeGreaterThanOrEqual(1)
    expect(report.body.data.repeatRate).toBeGreaterThanOrEqual(0)
    expect(report.body.data.repeatRate).toBeLessThanOrEqual(1)
    const top = report.body.data.topCustomers.find((item: { id: number }) => item.id === customerId)
    expect(top).toMatchObject({ id: customerId, phone: PHONE_NORMALIZED, totalSpend: SPEND })
  })

  it('ghi chú chăm sóc khách ghi được và xoá được', async () => {
    await api().patch(`/customers/${customerId}/note`).set(auth()).send({ note: 'Khách VIP, thích bàn cửa sổ' }).expect(200)
    let detail = await api().get(`/customers/${customerId}`).set(auth()).expect(200)
    expect(detail.body.data.note).toBe('Khách VIP, thích bàn cửa sổ')

    await api().patch(`/customers/${customerId}/note`).set(auth()).send({ note: null }).expect(200)
    detail = await api().get(`/customers/${customerId}`).set(auth()).expect(200)
    expect(detail.body.data.note).toBeNull()
  })

  it('hồ sơ không tồn tại trả 404 (không trả 200 với số liệu rỗng)', async () => {
    await api().get('/customers/2147483000').set(auth()).expect(404)
  })
})
