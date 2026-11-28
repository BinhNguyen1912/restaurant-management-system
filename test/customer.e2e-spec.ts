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

    // Dọn dấu vết lần chạy trước (nếu lần trước chết giữa chừng). Hoá đơn có item nên phải xoá
    // item trước, không thì khoá ngoại chặn.
    const leftovers = await prisma.order.findMany({
      where: { customer: { phone: PHONE_NORMALIZED } },
      select: { id: true, paymentId: true },
    })
    for (const leftover of leftovers) {
      await prisma.productSKUSnapshot.deleteMany({ where: { orderId: leftover.id } })
      await prisma.order.deleteMany({ where: { id: leftover.id } })
      await prisma.payment.deleteMany({ where: { id: leftover.paymentId } })
    }
    await prisma.customer.deleteMany({ where: { phone: PHONE_NORMALIZED } })
  })

  afterAll(async () => {
    // Thứ tự xoá theo khoá ngoại: hoá đơn có item (ProductSKUSnapshot ON DELETE NoAction) nên
    // phải xoá item trước, rồi tới đơn/thanh toán; PointRedemption đi theo khách (Cascade).
    for (const created of createdOpenOrders) {
      await prisma.productSKUSnapshot.deleteMany({ where: { orderId: created.orderId } })
      await prisma.order.deleteMany({ where: { id: created.orderId } })
      await prisma.payment.deleteMany({ where: { id: created.paymentId } })
    }
    if (createdReservationIds.length > 0) {
      await prisma.reservation.deleteMany({ where: { id: { in: createdReservationIds } } })
    }
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

  // ---------------------------------------------------------------------------------------------
  // Điểm thưởng. Điểm tích luỹ KHÔNG lưu trong bảng nào — nó là hàm của đơn PAID, nên bài test
  // dưới đây vừa kiểm số dư vừa kiểm luôn quan hệ nhân quả: tạo đơn PAID ⇒ có điểm, huỷ đơn đã
  // dùng điểm ⇒ điểm về lại.
  // ---------------------------------------------------------------------------------------------

  /** Số điểm tích luỹ kỳ vọng từ đơn PAID ở trên: floor(250.000 / 20.000). */
  const EARNED_FROM_PAID_ORDER = Math.floor(SPEND / 20_000)

  const createdOpenOrders: { orderId: number; paymentId: number }[] = []
  const createdReservationIds: number[] = []
  let openSkuId: number

  /** Đơn CHƯA thu tiền của chính khách test — thứ duy nhất được phép trừ điểm. */
  const createOpenOrder = async (price: number) => {
    const sku = await prisma.sKU.findFirstOrThrow({
      where: { deletedAt: null },
      select: { id: true, productId: true, value: true },
    })
    openSkuId = sku.id
    const payment = await prisma.payment.create({
      data: { status: 'PENDING', amount: price, branchId },
      select: { id: true },
    })
    const order = await prisma.order.create({
      data: {
        customerId,
        paymentId: payment.id,
        status: 'PENDING',
        branchId,
        subtotal: price,
        grandTotal: price,
        // thuế/phí = 0 để con số trong test chỉ phụ thuộc phần giảm giá do điểm
        taxRate: 0,
        serviceChargeRate: 0,
        items: {
          create: [
            {
              skuId: sku.id,
              productId: sku.productId,
              productName: 'Món test điểm',
              skuValue: sku.value ?? 'M',
              image: '',
              productTranslations: [],
              quantity: 1,
              skuPrice: price,
            },
          ],
        },
      },
      select: { id: true },
    })
    const created = { orderId: order.id, paymentId: payment.id }
    createdOpenOrders.push(created)
    return created
  }

  it('số dư điểm = số điểm suy ra từ đơn đã thu tiền, kèm lịch sử', async () => {
    const res = await api().get(`/customers/${customerId}/points`).set(auth()).expect(200)
    expect(res.body.data).toMatchObject({
      earned: EARNED_FROM_PAID_ORDER,
      spent: 0,
      balance: EARNED_FROM_PAID_ORDER,
      vndPerPoint: 20_000,
      pointValueVnd: 1_000,
      minRedeemPoints: 10,
    })
    const earnedEntry = res.body.data.history.find((item: { type: string }) => item.type === 'EARNED')
    expect(earnedEntry).toMatchObject({ type: 'EARNED', orderId, amount: SPEND, points: EARNED_FROM_PAID_ORDER })

    // hồ sơ khách cũng phải thấy cùng con số đó (một nguồn, hai chỗ đọc)
    const detail = await api().get(`/customers/${customerId}`).set(auth()).expect(200)
    expect(detail.body.data.points).toMatchObject({ earned: EARNED_FROM_PAID_ORDER, balance: EARNED_FROM_PAID_ORDER })
  })

  it('danh sách đơn chưa thu tiền: đúng đơn đổi được điểm, kèm trần điểm của từng đơn', async () => {
    const { orderId: openOrderId } = await createOpenOrder(100_000)

    // đơn có thanh toán PENDING nhưng KHÔNG có dòng món: trừ điểm sẽ tính lại tiền đơn thành 0
    const emptyPayment = await prisma.payment.create({
      data: { status: 'PENDING', amount: 50_000, branchId },
      select: { id: true },
    })
    const emptyOrder = await prisma.order.create({
      data: {
        customerId,
        paymentId: emptyPayment.id,
        status: 'PENDING',
        branchId,
        subtotal: 50_000,
        grandTotal: 50_000,
        taxRate: 0,
        serviceChargeRate: 0,
      },
      select: { id: true },
    })
    createdOpenOrders.push({ orderId: emptyOrder.id, paymentId: emptyPayment.id })

    const res = await api().get(`/customers/${customerId}/open-orders`).set(auth()).expect(200)
    const ids = res.body.data.map((item: { id: number }) => item.id)

    expect(ids).toContain(openOrderId)
    // đơn đã thu tiền và đơn rỗng dòng món đều KHÔNG phải lựa chọn hợp lệ
    expect(ids).not.toContain(orderId)
    expect(ids).not.toContain(emptyOrder.id)
    expect(res.body.data.find((item: { id: number }) => item.id === openOrderId)).toMatchObject({
      id: openOrderId,
      status: 'PENDING',
      payable: 100_000,
      maxRedeemPoints: 100,
    })
  })

  it('đổi quá số dư hoặc dưới mức tối thiểu đều bị chặn', async () => {
    const { orderId: openOrderId } = await createOpenOrder(100_000)

    const over = await api()
      .post(`/customers/${customerId}/points/redeem`)
      .set(auth())
      .send({ points: EARNED_FROM_PAID_ORDER + 5, orderId: openOrderId })
      .expect(400)
    expect(over.body.message).toBe('Error.NotEnoughPoints')

    const belowMin = await api()
      .post(`/customers/${customerId}/points/redeem`)
      .set(auth())
      .send({ points: 3, orderId: openOrderId })
      .expect(400)
    expect(belowMin.body.message).toBe('Error.MinRedeemPoints')

    // không có dòng nào được ghi khi bị chặn
    expect(await prisma.pointRedemption.count({ where: { customerId } })).toBe(0)
  })

  it('chỉ trừ điểm trên đơn CHƯA thu tiền của chính khách đó', async () => {
    const paidOrder = await api()
      .post(`/customers/${customerId}/points/redeem`)
      .set(auth())
      .send({ points: 10, orderId })
      .expect(400)
    expect(paidOrder.body.message).toBe('Error.OrderAlreadyPaidCannotChangeMoney')

    const { orderId: openOrderId } = await createOpenOrder(100_000)
    await expect(prisma.pointRedemption.count({ where: { orderId: openOrderId } })).resolves.toBe(0)

    // đơn không thuộc khách này (tạo cho khách khác) => không tìm thấy đơn hợp lệ
    const other = await prisma.customer.create({
      data: { phone: '0999000222', name: 'Khách Khác' },
      select: { id: true, phone: true },
    })
    try {
      const strangerOrderPayment = await prisma.payment.create({
        data: { status: 'PENDING', amount: 50_000, branchId },
        select: { id: true },
      })
      const strangerOrder = await prisma.order.create({
        data: { customerId: other.id, paymentId: strangerOrderPayment.id, status: 'PENDING', branchId, subtotal: 50_000, grandTotal: 50_000 },
        select: { id: true },
      })
      const res = await api()
        .post(`/customers/${customerId}/points/redeem`)
        .set(auth())
        .send({ points: 10, orderId: strangerOrder.id })
        .expect(400)
      expect(res.body.message).toBe('Error.OrderNotEligibleForPoints')
      await prisma.order.delete({ where: { id: strangerOrder.id } })
      await prisma.payment.delete({ where: { id: strangerOrderPayment.id } })
    } finally {
      await prisma.customer.delete({ where: { id: other.id } })
    }
  })

  it('đổi điểm thành giảm giá: tiền đơn, tiền phải thu, số dư và audit cùng đổi', async () => {
    const { orderId: openOrderId, paymentId: openPaymentId } = await createOpenOrder(100_000)
    const REDEEM = 10
    const VALUE = REDEEM * 1_000

    const res = await api()
      .post(`/customers/${customerId}/points/redeem`)
      .set(auth())
      .send({ points: REDEEM, orderId: openOrderId, reason: 'Khách dùng điểm' })
      .expect(201)

    expect(res.body.data).toMatchObject({
      points: REDEEM,
      valueVnd: VALUE,
      orderId: openOrderId,
      orderGrandTotal: 100_000 - VALUE,
      balance: EARNED_FROM_PAID_ORDER - REDEEM,
    })

    // tiền trên đơn, trên Payment (số phải thu) và dòng điểm phải khớp nhau
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: openOrderId },
      select: { discountTotal: true, grandTotal: true, subtotal: true, payment: { select: { amount: true } } },
    })
    expect(Number(order.discountTotal.toString())).toBe(VALUE)
    expect(Number(order.grandTotal.toString())).toBe(100_000 - VALUE)
    expect(Number(order.payment.amount.toString())).toBe(100_000 - VALUE)

    const redemption = await prisma.pointRedemption.findFirstOrThrow({ where: { customerId, orderId: openOrderId } })
    expect(redemption.points).toBe(REDEEM)
    expect(Number(redemption.valueVnd.toString())).toBe(VALUE)
    expect(redemption.voidedAt).toBeNull()

    const audit = await prisma.auditLog.findFirst({ where: { entityId: openOrderId, action: 'POINTS_REDEEMED' } })
    expect(audit).not.toBeNull()

    const points = await api().get(`/customers/${customerId}/points`).set(auth()).expect(200)
    expect(points.body.data).toMatchObject({ earned: EARNED_FROM_PAID_ORDER, spent: REDEEM, balance: EARNED_FROM_PAID_ORDER - REDEEM })
    const redeemedEntry = points.body.data.history.find((item: { type: string }) => item.type === 'REDEEMED')
    expect(redeemedEntry).toMatchObject({ type: 'REDEEMED', points: REDEEM, valueVnd: VALUE, orderId: openOrderId, voided: false })

    // huỷ đơn => điểm về lại (không mất tiền hai lần), dòng cũ vẫn còn để đối soát
    await api()
      .put(`/orders/${openOrderId}`)
      .set(auth())
      .send({ status: 'CANCELLED', quantity: 1, skuId: openSkuId, reason: 'Khách đổi ý' })
      .expect(200)

    const afterCancel = await api().get(`/customers/${customerId}/points`).set(auth()).expect(200)
    expect(afterCancel.body.data).toMatchObject({ earned: EARNED_FROM_PAID_ORDER, spent: 0, balance: EARNED_FROM_PAID_ORDER })
    const voided = afterCancel.body.data.history.find((item: { type: string; voided?: boolean }) => item.type === 'REDEEMED')
    expect(voided).toMatchObject({ points: REDEEM, voided: true })

    const voidedRow = await prisma.pointRedemption.findFirstOrThrow({ where: { customerId, orderId: openOrderId } })
    expect(voidedRow.voidedAt).not.toBeNull()
    expect(openPaymentId).toBeTruthy()
  })

  it('đơn không có dòng món thì không trừ điểm được (không biến hoá đơn thành 0 đồng)', async () => {
    const payment = await prisma.payment.create({
      data: { status: 'PENDING', amount: 80_000, branchId },
      select: { id: true },
    })
    const order = await prisma.order.create({
      data: { customerId, paymentId: payment.id, status: 'PENDING', branchId, subtotal: 80_000, grandTotal: 80_000 },
      select: { id: true },
    })
    createdOpenOrders.push({ orderId: order.id, paymentId: payment.id })

    const res = await api()
      .post(`/customers/${customerId}/points/redeem`)
      .set(auth())
      .send({ points: 10, orderId: order.id })
      .expect(400)
    expect(res.body.message).toBe('Error.OrderNotEligibleForPoints')

    const untouched = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { grandTotal: true } })
    expect(Number(untouched.grandTotal.toString())).toBe(80_000)
  })

  it('đơn đặt cọc: trừ điểm làm giảm tiền đơn nhưng KHÔNG ghi đè số tiền cọc', async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: { name: 'ADMIN' } }, select: { id: true } })
    const table = await prisma.tableNode.findFirstOrThrow({ where: { deletedAt: null }, select: { id: true } })
    const DEPOSIT = 200_000
    const reservation = await prisma.reservation.create({
      data: {
        userId: admin.id,
        tableNodeId: table.id,
        branchId,
        customerId,
        customerName: 'Khách Test',
        customerPhone: PHONE_NORMALIZED,
        guestCount: 2,
        reservationTime: new Date(),
        hasPreOrder: true,
        depositAmount: DEPOSIT,
        depositPercent: 50,
      },
      select: { id: true },
    })
    createdReservationIds.push(reservation.id)

    const { orderId: depositOrderId, paymentId: depositPaymentId } = await createOpenOrder(400_000)
    await prisma.order.update({ where: { id: depositOrderId }, data: { reservationId: reservation.id } })
    await prisma.payment.update({ where: { id: depositPaymentId }, data: { amount: DEPOSIT } })

    const res = await api()
      .post(`/customers/${customerId}/points/redeem`)
      .set(auth())
      .send({ points: 10, orderId: depositOrderId })
      .expect(201)
    expect(res.body.data.orderGrandTotal).toBe(400_000 - 10_000)

    const after = await prisma.order.findUniqueOrThrow({
      where: { id: depositOrderId },
      select: { grandTotal: true, payment: { select: { amount: true } } },
    })
    expect(Number(after.grandTotal.toString())).toBe(400_000 - 10_000)
    // tiền cọc vẫn nguyên: phần còn lại được thu bằng Payment khác, ghi đè ở đây là hỏng đối chiếu
    expect(Number(after.payment.amount.toString())).toBe(DEPOSIT)
  })

  it('consent: chưa hỏi khách thì mọi mục đích đều CHƯA đồng ý', async () => {
    const res = await api().get(`/customers/${customerId}/consent`).set(auth()).expect(200)
    const marketing = res.body.data.find((item: { purpose: string }) => item.purpose === 'MARKETING')
    const service = res.body.data.find((item: { purpose: string }) => item.purpose === 'SERVICE')
    expect(marketing).toMatchObject({ granted: false, active: false, stale: false, at: null, version: null })
    expect(service).toMatchObject({ granted: false, active: false })

    // hồ sơ khách trả cùng dữ liệu đó (một nguồn, hai chỗ đọc)
    const detail = await api().get(`/customers/${customerId}`).set(auth()).expect(200)
    expect(detail.body.data.consents).toHaveLength(2)
  })

  it('consent: ghi nhận đồng ý, lặp lại thì không sinh dòng mới, rút thì mất hiệu lực', async () => {
    const granted = await api()
      .post(`/customers/${customerId}/consent`)
      .set(auth())
      .send({ purpose: 'MARKETING', granted: true })
      .expect(201)
    expect(granted.body.data.find((item: { purpose: string }) => item.purpose === 'MARKETING')).toMatchObject({
      granted: true,
      active: true,
      stale: false,
    })

    // đồng ý theo TỪNG mục đích: nhận ưu đãi không kéo theo mục đích phục vụ
    expect(granted.body.data.find((item: { purpose: string }) => item.purpose === 'SERVICE')).toMatchObject({
      active: false,
      at: null,
    })

    await api()
      .post(`/customers/${customerId}/consent`)
      .set(auth())
      .send({ purpose: 'MARKETING', granted: true })
      .expect(201)
    expect(await prisma.consentLog.count({ where: { customerId } })).toBe(1)

    const revoked = await api()
      .post(`/customers/${customerId}/consent`)
      .set(auth())
      .send({ purpose: 'MARKETING', granted: false, note: 'Khách đổi ý' })
      .expect(201)
    expect(revoked.body.data.find((item: { purpose: string }) => item.purpose === 'MARKETING')).toMatchObject({
      granted: false,
      active: false,
    })

    // append-only: rút đồng ý KHÔNG xoá dòng cũ, lịch sử là bằng chứng
    const rows = await prisma.consentLog.findMany({ where: { customerId }, orderBy: { id: 'asc' } })
    expect(rows.map((row) => row.granted)).toEqual([true, false])
    expect(rows[0].ip).toBeTruthy()

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'CUSTOMER', entityId: customerId, action: 'CONSENT_RECORDED' },
      orderBy: { id: 'desc' },
    })
    expect(audit).not.toBeNull()
  })

  it('consent: nhật ký KHÔNG sửa được (append-only ở tầng DB)', async () => {
    const row = await prisma.consentLog.findFirstOrThrow({ where: { customerId }, select: { id: true } })
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "ConsentLog" SET granted = NOT granted WHERE id = ${row.id}`),
    ).rejects.toThrow(/append-only/)
  })

  it('đặt bàn có hỏi khách: đồng ý nhận ưu đãi được ghi ngay khi thu SĐT', async () => {
    const phone = '0999000333'
    await prisma.customer.deleteMany({ where: { phone } })
    const table = await prisma.tableNode.findFirstOrThrow({ where: { status: 'AVAILABLE', deletedAt: null }, select: { id: true } })

    const res = await api()
      .post('/reservation')
      .set(auth())
      .send({
        customerName: 'Khách Consent',
        customerPhone: phone,
        tableNodeId: table.id,
        guestCount: 2,
        depositPercent: 0,
        reservationTime: new Date(Date.now() + 3_600_000).toISOString(),
        note: '',
        hasPreOrder: false,
        preOrderItems: [],
        marketingConsent: true,
      })
    expect(res.status).toBe(201)

    try {
      const customer = await prisma.customer.findFirstOrThrow({ where: { phone }, select: { id: true } })
      const rows = await prisma.consentLog.findMany({ where: { customerId: customer.id } })
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ purpose: 'MARKETING', granted: true })
    } finally {
      const reservationId = res.body.data?.reservation?.id ?? res.body.data?.id
      if (reservationId) await prisma.reservation.deleteMany({ where: { id: reservationId } })
      await prisma.tableNode.updateMany({ where: { id: table.id, status: 'RESERVED' }, data: { status: 'AVAILABLE' } })
      await prisma.customer.deleteMany({ where: { phone } })
    }
  })
})
