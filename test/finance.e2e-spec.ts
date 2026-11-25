import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/service/prisma.service'
import { LedgerPostingService } from '../src/shared/service/ledger-posting.service'
import { RedisService } from '../src/shared/service/redis.service'

/**
 * E2E API thật (supertest + AppModule): gọi HTTP như FE, chạm DB thật, dọn dữ liệu sau khi chạy.
 *
 * Phạm vi: những luồng tiền quan trọng nhất — sổ cái cân, ca/két có lệch, VAT trên đơn,
 * và chặn đọc chéo chi nhánh. Chạy: `npm run test:e2e` (cần DB dev đang chạy).
 */
describe('Finance (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let token: string
  const created: { shiftIds: number[]; orderIds: number[]; paymentIds: number[]; guestIds: number[]; areaIds: number[]; branchIds: number[]; userIds: number[] } = {
    shiftIds: [],
    userIds: [],
    orderIds: [],
    paymentIds: [],
    guestIds: [],
    areaIds: [],
    branchIds: [],
    reportEntryKeys: [] as string[],
    reconciliationRunIds: [] as number[],
    auditEntityIds: [] as number[],
    voucherIds: [] as number[],
    userIds: [] as number[],
    reservationIds: [] as number[],
    recipeIds: [] as number[],
    ingredientIds: [] as number[],
  }
  let originalBranchSettings: { id: number; taxRate: string; serviceChargeRate: string; pricesIncludeTax: boolean } | null = null

  /** ngày hôm nay theo giờ VN — KHÔNG dùng toISOString() (UTC) vì sau 17:00 giờ VN đã sang ngày khác */
  const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
  /**
   * Test tạo đơn cần tồn kho dồn dàng: các lần chạy trước đã trừ dần tồn trong Redis nên kết quả
   * phụ thuộc lịch sử. Trước khi chạy, nâng tồn mọi nguyên liệu lên mức lớn và NHỚ giá trị cũ để trả lại.
   */
  const stockBackup = new Map<string, Record<string, string>>()
  /** trạng thái SKU trước khi test (test trước có thể đã đánh OUT_OF_STOCK các SKU này) */
  const skuStatusBackup = new Map<number, string>()
  const recipeBackup = new Map<string, unknown | null>()
  const redisServiceForTests = () => app.get(RedisService)

  const resetSkuStatuses = async () => {
    // Test tạo đơn cần SKU bán được; trạng thái OUT_OF_STOCK do lần chạy trước để lại thì phải trả về.
    const skus = await prisma.sKU.findMany({ where: { deletedAt: null }, select: { id: true, status: true } })
    for (const sku of skus) {
      skuStatusBackup.set(sku.id, sku.status)
      if (sku.status !== 'AVAILABLE') {
        await prisma.sKU.update({ where: { id: sku.id }, data: { status: 'AVAILABLE' } })
      }
    }
  }

  const restoreSkuStatuses = async () => {
    for (const [id, status] of skuStatusBackup) {
      await prisma.sKU.update({ where: { id }, data: { status: status as never } })
    }
  }

  const topUpIngredientStock = async () => {
    const redis = redisServiceForTests()
    const ingredients = await prisma.ingredient.findMany({ where: { deletedAt: null }, select: { id: true } })
    for (const ingredient of ingredients) {
      const key = `ingredient:${ingredient.id}`
      const hash = ((await redis.getHash<string>(key)) ?? {}) as Record<string, string>
      if (!stockBackup.has(key)) stockBackup.set(key, hash)
      if (hash.stock !== undefined) {
        await redis.setHash(key, { ...hash, stock: 1_000_000 })
      }
    }
  }

  const restoreIngredientStock = async () => {
    const redis = redisServiceForTests()
    for (const [key, hash] of stockBackup) {
      // {} = hash mới do test tạo -> xoá hẳn; còn lại trả nguyên giá trị cũ
      if (Object.keys(hash).length === 0) await redis.del(key)
      else await redis.setHash(key, hash)
    }
  }

  const api = () => request(app.getHttpServer())
  const auth = () => ({ Authorization: `Bearer ${token}` })

  /**
   * Bàn để test: ưu tiên bàn đang AVAILABLE; hết bàn (test trước để lại OCCUPIED) thì
   * giải phóng 1 bàn. Test phải chạy được độc lập, không phụ thuộc thứ tự.
   */
  const takeTable = async (branchId: number) => {
    const free = await prisma.tableNode.findFirst({
      where: { branchId, status: 'AVAILABLE' },
      orderBy: { id: 'asc' },
    })
    if (free) return free
    const anyTable = await prisma.tableNode.findFirst({ where: { branchId }, orderBy: { id: 'asc' } })
    if (!anyTable) return null
    return prisma.tableNode.update({ where: { id: anyTable.id }, data: { status: 'AVAILABLE' } })
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)

    await topUpIngredientStock()
    await resetSkuStatuses()

    const login = await api()
      .post('/auth/login')
      .send({ email: 'admin@order.com', password: '123456' })
      .expect(201)
    token = login.body.accessToken
  })

  const attempt = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run()
    } catch (error: any) {
      // Dọn dẹp không được che lỗi test thật, nhưng phải kêu lên
      console.warn(`[e2e cleanup] ${label}: ${error?.message}`)
    }
  }

  afterAll(async () => {
    // Trả cấu hình chi nhánh về như cũ
    if (originalBranchSettings) {
      await attempt('restore branch settings', () => prisma.branch.update({
        where: { id: originalBranchSettings.id },
        data: {
          taxRate: originalBranchSettings.taxRate,
          serviceChargeRate: originalBranchSettings.serviceChargeRate,
          pricesIncludeTax: originalBranchSettings.pricesIncludeTax,
        },
      }))
    }

    // Dọn dữ liệu test
    if (created.shiftIds.length) {
      await attempt('cash movements', () => prisma.cashMovement.deleteMany({ where: { shiftId: { in: created.shiftIds } } }))
      await attempt('cash shifts', () => prisma.cashShift.deleteMany({ where: { id: { in: created.shiftIds } } }))
    }
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { OR: [{ refType: 'CASH_VARIANCE', refId: { in: created.shiftIds } }, { refType: 'ORDER_PAID_CASH', refId: { in: created.paymentIds } }] },
      select: { id: true },
    })
    if (ledgerEntries.length) {
      const ids = ledgerEntries.map((entry) => entry.id)
      await attempt('ledger lines', () => prisma.ledgerLine.deleteMany({ where: { entryId: { in: ids } } }))
      await attempt('ledger entries', () => prisma.ledgerEntry.deleteMany({ where: { id: { in: ids } } }))
    }
    if (created.orderIds.length) {
      // Dòng món của đơn nằm ở ProductSKUSnapshot (FK tới Order) -> xoá trước
      await attempt('order items', () => prisma.productSKUSnapshot.deleteMany({ where: { orderId: { in: created.orderIds } } }))
      await attempt('orders', () => prisma.order.deleteMany({ where: { id: { in: created.orderIds } } }))
    }
    if (created.paymentIds.length) await attempt('payments', () => prisma.payment.deleteMany({ where: { id: { in: created.paymentIds } } }))
    if (created.guestIds.length) await attempt('guests', () => prisma.guest.deleteMany({ where: { id: { in: created.guestIds } } }))
    if (created.areaIds.length) await attempt('areas', () => prisma.area.deleteMany({ where: { id: { in: created.areaIds } } }))
    if (created.recipeIds.length) {
      await attempt('recipes', () => prisma.sKURecipeIngredient.deleteMany({ where: { id: { in: created.recipeIds } } }))
    }
    if (created.ingredientIds.length) {
      await attempt('ingredients', () => prisma.ingredient.deleteMany({ where: { id: { in: created.ingredientIds } } }))
    }
    if (created.orderIds.length) {
      await attempt('cogs entries', () => prisma.ledgerEntry.deleteMany({ where: { refType: 'ORDER_COGS', refId: { in: created.orderIds } } }))
    }
    if (created.reservationIds.length) {
      await attempt('deposit settled entries', () => prisma.ledgerEntry.deleteMany({ where: { refType: 'DEPOSIT_SETTLED', refId: { in: created.reservationIds } } }))
      await attempt('reservations', () => prisma.reservation.deleteMany({ where: { id: { in: created.reservationIds } } }))
    }
    if (created.userIds.length) await attempt('users', () => prisma.user.deleteMany({ where: { id: { in: created.userIds } } }))
    if (created.voucherIds.length) {
      await attempt('voucher snapshots', () => prisma.voucherSnapshot.deleteMany({ where: { voucherId: { in: created.voucherIds } } }))
      await attempt('vouchers', () => prisma.voucher.deleteMany({ where: { id: { in: created.voucherIds } } }))
    }
    if (created.auditEntityIds.length) {
      await attempt('audit logs', () => prisma.auditLog.deleteMany({ where: { entityId: { in: created.auditEntityIds } } }))
    }
    if (created.reconciliationRunIds.length) {
      await attempt('reconciliation items', () => prisma.reconciliationItem.deleteMany({ where: { runId: { in: created.reconciliationRunIds } } }))
      await attempt('reconciliation runs', () => prisma.reconciliationRun.deleteMany({ where: { id: { in: created.reconciliationRunIds } } }))
    }
    if (created.reportEntryKeys.length) {
      await attempt('report ledger lines', () => prisma.ledgerLine.deleteMany({ where: { entry: { idempotencyKey: { in: created.reportEntryKeys } } } }))
      await attempt('report ledger entries', () => prisma.ledgerEntry.deleteMany({ where: { idempotencyKey: { in: created.reportEntryKeys } } }))
      await attempt('report projection', () => prisma.dailyBranchSummary.deleteMany({ where: { branchId: { in: created.branchIds } } }))
    }
    if (created.branchIds.length) await attempt('branches', () => prisma.branch.deleteMany({ where: { id: { in: created.branchIds } } }))

    for (const [key, value] of recipeBackup) {
      if (value === null) await redisServiceForTests().del(key)
      else await redisServiceForTests().setJson(key, value)
    }
    await restoreIngredientStock()
    await restoreSkuStatuses()
    await app.close()
  })

  it('healthcheck: public (không token), kiểm cả Postgres và Redis', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.checks).toEqual({ database: 'up', redis: 'up' })
    expect(typeof res.body.uptimeSeconds).toBe('number')
    expect(typeof res.body.timezone).toBe('string')
  })

  it('sổ cái cân: Σ Nợ = Σ Có và không có bút toán lệch', async () => {
    const res = await api().get('/ledger/integrity').set(auth()).expect(200)
    // Bất biến của sổ kép — không phụ thuộc dữ liệu dev đang có
    expect(res.body.difference).toBe(0)
    expect(res.body.totalDebit).toBe(res.body.totalCredit)
    expect(res.body.unbalancedEntries).toBe(0)
  })

  it('ca & két: đóng ca lệch -> variance đúng và sinh bút toán CASH_VARIANCE cân', async () => {
    const open = await api().post('/cash-shifts').set(auth()).send({ openingFloat: 200_000 }).expect(201)
    const shiftId = open.body.id as number
    created.shiftIds.push(shiftId)

    await api()
      .post(`/cash-shifts/${shiftId}/movements`)
      .set(auth())
      .send({ type: 'OUT', reason: 'e2e: mua đá', amount: 50_000, evidenceUrls: ['https://res.cloudinary.com/demo/image/upload/hoa-don.jpg'] })
      .expect(201)

    // Mo ca lan 2 cung chi nhanh -> 409
    await api().post('/cash-shifts').set(auth()).send({ openingFloat: 0 }).expect(409)

    const detail = await api().get(`/cash-shifts/${shiftId}`).set(auth()).expect(200)
    const expected = detail.body.liveTotals.expectedCash as number
    expect(detail.body.movements[0].evidenceUrls).toHaveLength(1)

    const counted = expected - 1_000
    const closed = await api().post(`/cash-shifts/${shiftId}/close`).set(auth()).send({ countedCash: counted }).expect(201)
    expect(closed.body.variance).toBe(-1_000)
    expect(closed.body.ledgerEntryId).toBeTruthy()

    const entries = await api().get('/ledger/entries?refType=CASH_VARIANCE&limit=1').set(auth()).expect(200)
    const entry = entries.body.data[0]
    expect(entry.balanced).toBe(true)
    expect(entry.lines.map((line: any) => line.accountCode).sort()).toEqual(['CASH', 'CASH_SHORTAGE'])

    // Dong ca lan 2 -> 409
    await api().post(`/cash-shifts/${shiftId}/close`).set(auth()).send({ countedCash: counted }).expect(409)
  })

  it('VAT: đơn tạo mới lấy cấu hình chi nhánh, thu tiền mặt sinh bút toán có TAX_PAYABLE', async () => {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
    expect(branch).toBeTruthy()
    originalBranchSettings = {
      id: branch!.id,
      taxRate: branch!.taxRate.toString(),
      serviceChargeRate: branch!.serviceChargeRate.toString(),
      pricesIncludeTax: branch!.pricesIncludeTax,
    }

    await api()
      .put(`/branches/${branch!.id}/settings`)
      .set(auth())
      .send({ taxRate: 8, serviceChargeRate: 5, pricesIncludeTax: true })
      .expect(200)

    const table = await takeTable(branch!.id)
    expect(table).toBeTruthy()

    const guestLogin = await api()
      .post('/guest/login')
      .send({ name: 'e2e khách VAT', tableNodeId: table!.id, token: table!.token })
      .expect(201)
    const guestId = guestLogin.body.guest.id as number
    created.guestIds.push(guestId)

    const sku = await prisma.sKU.findFirst({ where: { product: { deletedAt: null, status: 'ACTIVE' } }, orderBy: { id: 'asc' } })
    expect(sku).toBeTruthy()

    const order = await api()
      .post(`/orders/create-order-for-guest/${guestId}`)
      .set(auth())
      .send([{ skuId: sku!.id, quantity: 2 }])
      .expect(201)

    const orderId = order.body.id as number
    created.orderIds.push(orderId)
    created.paymentIds.push(order.body.paymentId as number)

    expect(order.body.taxRate).toBe(8)
    expect(order.body.serviceChargeRate).toBe(5)
    expect(order.body.taxTotal).toBeGreaterThan(0)
    expect(Number.isInteger(order.body.grandTotal)).toBe(true)

    // Thu tiền mặt cho khách -> bút toán có TAX_PAYABLE
    await api().get(`/orders/pay-orders-by-guest/${guestId}`).set(auth()).expect(200)

    const entries = await api().get('/ledger/entries?refType=ORDER_PAID_CASH&limit=1').set(auth()).expect(200)
    const entry = entries.body.data[0]
    expect(entry.balanced).toBe(true)
    expect(entry.lines.map((line: any) => line.accountCode)).toEqual(
      expect.arrayContaining(['CASH', 'TAX_PAYABLE', 'REVENUE_FOOD']),
    )
    expect(entry.debitTotal).toBe(order.body.grandTotal)
  })

  it('báo cáo doanh thu: projection từ sổ cái đúng từng ô (2 chi nhánh × 3 ngày, tiền mặt + VNPay + hoàn tiền)', async () => {
    const posting = app.get(LedgerPostingService)
    const stamp = Date.now()
    const days = ['2026-03-02', '2026-03-03', '2026-03-04']

    const branchA = await prisma.branch.create({
      data: { code: `E2E-REP-A-${stamp}`, name: 'E2E báo cáo A', address: 'e2e', isActive: true },
    })
    const branchB = await prisma.branch.create({
      data: { code: `E2E-REP-B-${stamp}`, name: 'E2E báo cáo B', address: 'e2e', isActive: true },
    })
    created.branchIds.push(branchA.id, branchB.id)

    /** ghi 1 bút toán thu tiền rồi đẩy ngày nghiệp vụ về đúng ngày cần test */
    const post = async (branchId: number, day: string, seq: number, amount: number, method: 'CASH' | 'VNPAY') => {
      const key = `e2e-report:${stamp}:${branchId}:${day}:${seq}`
      created.reportEntryKeys.push(key)
      const { id } = await posting.postEntry({
        branchId,
        refType: method === 'CASH' ? 'ORDER_PAID_CASH' : 'ORDER_PAID_VNPAY',
        refId: seq,
        idempotencyKey: key,
        lines: [
          { accountCode: method === 'CASH' ? 'CASH' : 'VNPAY_CLEARING', direction: 'DEBIT', amount },
          { accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount },
        ],
      })
      await prisma.ledgerEntry.update({
        where: { id },
        data: { occurredAt: new Date(`${day}T10:00:00.000+07:00`), postedAt: new Date(`${day}T10:00:00.000+07:00`) },
      })
    }

    // chi nhánh A: 3 ngày tiền mặt 100k/ngày; ngày 3 thêm 1 VNPay 50k
    for (const [index, day] of days.entries()) {
      await post(branchA.id, day, index + 1, 100_000, 'CASH')
    }
    await post(branchA.id, days[2], 9, 50_000, 'VNPAY')

    // chi nhánh B: 1 ngày tiền mặt 70k + 1 hoàn tiền 70k -> ngày đó net 0, refund 70k
    await post(branchB.id, days[0], 11, 70_000, 'CASH')
    const refundKey = `e2e-report:${stamp}:${branchB.id}:refund`
    created.reportEntryKeys.push(refundKey)
    const refund = await posting.postEntry({
      branchId: branchB.id,
      refType: 'REFUND',
      refId: 11,
      idempotencyKey: refundKey,
      lines: [
        { accountCode: 'REVENUE_FOOD', direction: 'DEBIT', amount: 70_000 },
        { accountCode: 'CASH', direction: 'CREDIT', amount: 70_000 },
      ],
    })
    await prisma.ledgerEntry.update({
      where: { id: refund.id },
      data: { occurredAt: new Date(`${days[1]}T10:00:00.000+07:00`), postedAt: new Date(`${days[1]}T10:00:00.000+07:00`) },
    })

    // tính lại projection cho kỳ test (chạy tay như nút "Tính lại" trên FE)
    for (const branchId of [branchA.id, branchB.id]) {
      await api()
        .post('/reports/revenue/recompute')
        .set(auth())
        .send({ fromDate: days[0], toDate: days[2], branchId })
        .expect(201)
    }

    // chi nhánh A: 3 ngày × 100k + 50k VNPay ngày cuối
    const reportA = await api()
      .get(`/reports/revenue?fromDate=${days[0]}&toDate=${days[2]}&branchId=${branchA.id}`)
      .set(auth())
      .expect(200)
    expect(reportA.body.rows).toHaveLength(3)
    expect(reportA.body.totals.cashIn).toBe(300_000)
    expect(reportA.body.totals.vnpayIn).toBe(50_000)
    expect(reportA.body.totals.grandTotal).toBe(350_000)
    expect(reportA.body.totals.net).toBe(350_000)
    expect(reportA.body.totals.orderCount).toBe(4)
    expect(reportA.body.byMethod).toEqual([
      { method: 'CASH', amount: 300_000 },
      { method: 'VNPAY', amount: 50_000 },
    ])
    expect(reportA.body.rows[2]).toMatchObject({ date: days[2], cashIn: 100_000, vnpayIn: 50_000, grandTotal: 150_000 })

    // chi nhánh B: thu 70k ngày 1, hoàn 70k ngày 2 -> tổng net 0, refund 70k
    const reportB = await api()
      .get(`/reports/revenue?fromDate=${days[0]}&toDate=${days[2]}&branchId=${branchB.id}`)
      .set(auth())
      .expect(200)
    expect(reportB.body.totals.net).toBe(0)
    expect(reportB.body.totals.refund).toBe(70_000)
    expect(reportB.body.rows.find((row: any) => row.date === days[1])).toMatchObject({ refund: 70_000, net: -70_000 })

    // dashboard đọc cùng con số (contract không đổi)
    const dashboard = await api()
      .post('/dashboard/indicator')
      .set(auth())
      .send({ fromDate: `${days[0]}T00:00:00.000+07:00`, toDate: `${days[2]}T23:59:59.999+07:00` })
      .expect(201)
    expect(typeof dashboard.body.revenue).toBe('number')
    expect(dashboard.body.revenueByDate.length).toBeGreaterThan(0)
  })

  it('đối soát lưu lịch sử: chạy 1 kỳ, ghi run + item, và Payment tiền mặt vừa thu được xếp MATCHED', async () => {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
    const today = vnToday()

    // tạo 1 đơn tiền mặt thật rồi thu tiền (bút toán sinh trong cùng transaction)
    const table = await takeTable(branch!.id)
    expect(table).toBeTruthy()
    const guestLogin = await api()
      .post('/guest/login')
      .send({ name: 'e2e đối soát', tableNodeId: table!.id, token: table!.token })
      .expect(201)
    const guestId = guestLogin.body.guest.id as number
    created.guestIds.push(guestId)
    const sku = await prisma.sKU.findFirst({ where: { product: { deletedAt: null, status: 'ACTIVE' } }, orderBy: { id: 'asc' } })
    const order = await api()
      .post(`/orders/create-order-for-guest/${guestId}`)
      .set(auth())
      .send([{ skuId: sku!.id, quantity: 1 }])
      .expect(201)
    created.orderIds.push(order.body.id)
    created.paymentIds.push(order.body.paymentId)
    await api().get(`/orders/pay-orders-by-guest/${guestId}`).set(auth()).expect(200)

    // chạy đối soát kỳ hôm nay cho chi nhánh này
    const run = await api()
      .post('/reconciliation/runs')
      .set(auth())
      .send({ fromDate: today, toDate: today, branchId: branch!.id })
      .expect(201)
    created.reconciliationRunIds.push(run.body.run.id)
    expect(run.body.run.status).toBe('COMPLETED')
    expect(run.body.run.summary.byKind.MATCHED ?? 0).toBeGreaterThanOrEqual(1)
    expect(run.body.run.summary.byKind.MISSING_IN_LEDGER ?? 0).toBe(0)

    // chi tiết: item của payment vừa thu phải MATCHED, đúng số tiền
    const detail = await api().get(`/reconciliation/runs/${run.body.run.id}`).set(auth()).expect(200)
    const item = detail.body.items.find((row: any) => row.paymentId === order.body.paymentId)
    expect(item).toBeTruthy()
    expect(item.kind).toBe('MATCHED')
    expect(item.amountDelta).toBe(0)

    // lịch sử có run này; đánh dấu xử lý được
    const list = await api().get(`/reconciliation/runs?branchId=${branch!.id}`).set(auth()).expect(200)
    expect(list.body.data.map((row: any) => row.id)).toContain(run.body.run.id)
    const updated = await api().post(`/reconciliation/items/${item.id}/status`).set(auth()).send({ status: 'RESOLVED' }).expect(201)
    expect(updated.body.item.status).toBe('RESOLVED')
  })

  it('audit: huỷ đơn thiếu lý do -> 400; có lý do -> ghi nhật ký kèm before/after + reason', async () => {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
    const table = await takeTable(branch!.id)
    expect(table).toBeTruthy()
    const guestLogin = await api()
      .post('/guest/login')
      .send({ name: 'e2e audit', tableNodeId: table!.id, token: table!.token })
      .expect(201)
    const guestId = guestLogin.body.guest.id as number
    created.guestIds.push(guestId)
    const sku = await prisma.sKU.findFirst({ where: { product: { deletedAt: null, status: 'ACTIVE' } }, orderBy: { id: 'asc' } })
    const order = await api()
      .post(`/orders/create-order-for-guest/${guestId}`)
      .set(auth())
      .send([{ skuId: sku!.id, quantity: 1 }])
      .expect(201)
    const orderId = order.body.id as number
    created.orderIds.push(orderId)
    created.paymentIds.push(order.body.paymentId)
    created.auditEntityIds.push(orderId)

    // 1) thiếu lý do -> 400, và KHÔNG được ghi audit rác
    const rejected = await api()
      .put(`/orders/${orderId}`)
      .set(auth())
      .send({ status: 'CANCELLED', skuId: sku!.id, quantity: 1 })
    expect([400, 422]).toContain(rejected.status)
    expect(await prisma.auditLog.count({ where: { entityType: 'ORDER', entityId: orderId } })).toBe(0)

    // 2) có lý do -> huỷ + ghi audit
    await api()
      .put(`/orders/${orderId}`)
      .set(auth())
      .send({ status: 'CANCELLED', skuId: sku!.id, quantity: 1, reason: 'e2e: khách đổi ý' })
      .expect(200)

    const audit = await prisma.auditLog.findFirst({ where: { entityType: 'ORDER', entityId: orderId } })
    expect(audit).toBeTruthy()
    expect(audit!.action).toBe('ORDER_CANCELLED')
    expect(audit!.reason).toBe('e2e: khách đổi ý')
    expect(audit!.actorId).toBeTruthy()
    expect(audit!.actorRole).toBe('ADMIN')
    expect((audit!.before as any).status).toBe('PENDING')
    expect((audit!.after as any).status).toBe('CANCELLED')

    // 3) đọc qua API: thấy bản ghi, và không có endpoint sửa/xoá
    const list = await api().get(`/audit-logs?entityType=ORDER&entityId=${orderId}`).set(auth()).expect(200)
    expect(list.body.data.some((row: any) => row.id === audit!.id)).toBe(true)
    expect((await api().delete(`/audit-logs/${audit!.id}`).set(auth())).status).toBe(404)
    expect((await api().put(`/audit-logs/${audit!.id}`).set(auth()).send({ reason: 'x' })).status).toBe(404)
  })

  it('audit: sửa giá sản phẩm -> ghi nhật ký PRODUCT_PRICE_CHANGED với giá cũ/mới', async () => {
    // chọn sản phẩm KHÔNG có biến thể: 1 SKU, giá = basePrice -> payload hợp lệ, đổi giá là đổi basePrice
    const candidates = await prisma.product.findMany({
      where: { deletedAt: null, skus: { some: { deletedAt: null } } },
      include: { skus: { where: { deletedAt: null } }, categories: true },
      orderBy: { id: 'asc' },
      take: 50,
    })
    // variants là Json -> lọc ở JS: chỉ lấy sản phẩm 1 SKU, không biến thể (payload update đơn giản, hợp lệ)
    const product = candidates.find(
      (row) => Array.isArray(row.variants) && (row.variants as unknown[]).length === 0 && row.skus.length === 1,
    )
    expect(product).toBeTruthy()
    created.auditEntityIds.push(product!.id)

    const sku = product!.skus[0]
    const payload = (basePrice: number) => ({
      name: product!.name,
      basePrice,
      virtualPrice: Number(product!.virtualPrice ?? basePrice),
      variants: [],
      publishedAt: product!.publishedAt,
      images: product!.images,
      categories: product!.categories.map((category) => category.id),
      skus: [{ image: product!.images[0] ?? '', price: basePrice, value: product!.name }],
    })

    const before = Number(product!.basePrice)
    const newPrice = before + 1000
    await api().put(`/manage-product/products/${product!.id}`).set(auth()).send(payload(newPrice)).expect(200)

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'PRODUCT', entityId: product!.id, action: 'PRODUCT_PRICE_CHANGED' },
      orderBy: { id: 'desc' },
    })
    expect(audit).toBeTruthy()
    const change = (audit!.after as any).changes.find((row: any) => row.skuId === sku.id)
    expect(Number(change.from)).toBe(before)
    expect(Number(change.to)).toBe(newPrice)

    // trả giá về như cũ để không làm lệch dữ liệu dev
    await api().put(`/manage-product/products/${product!.id}`).set(auth()).send(payload(before)).expect(200)
    const restored = await prisma.sKU.findUnique({ where: { id: sku.id }, select: { price: true } })
    expect(Number(restored!.price)).toBe(before)
  })

  it('voucher: đặt món kèm mã giảm giá -> snapshot giữ số tiền đã giảm, discountTotal + payment khớp', async () => {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
    const table = await takeTable(branch!.id)
    expect(table).toBeTruthy()

    const guestLogin = await api()
      .post('/guest/login')
      .send({ name: 'e2e voucher', tableNodeId: table!.id, token: table!.token })
      .expect(201)
    const guestId = guestLogin.body.guest.id as number
    created.guestIds.push(guestId)

    const sku = await prisma.sKU.findFirst({ where: { product: { deletedAt: null, status: 'ACTIVE' } }, orderBy: { id: 'asc' } })
    const code = `E2E${Date.now()}`
    const voucher = await prisma.voucher.create({
      data: {
        code,
        discountType: 'PERCENT',
        discountValue: 10,
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(Date.now() + 60 * 60 * 1000),
        usageLimit: 5,
        status: 'ACTIVE',
      },
    })
    created.voucherIds.push(voucher.id)

    const quantity = 2
    const order = await api()
      .post(`/orders/create-order-for-guest/${guestId}?voucherCode=${code}`)
      .set(auth())
      .send([{ skuId: sku!.id, quantity }])
      .expect(201)
    created.orderIds.push(order.body.id)
    created.paymentIds.push(order.body.paymentId)

    const expectedSubtotal = Number(sku!.price) * quantity
    const expectedDiscount = Math.round((expectedSubtotal * 10) / 100)
    expect(order.body.subtotal).toBe(expectedSubtotal)
    expect(order.body.discountTotal).toBe(expectedDiscount)
    // tiền phải thu = công thức chung (ADR D6): VAT "đã gồm trong giá" thì KHÔNG cộng thêm lần nữa
    const config = await prisma.branch.findUnique({ where: { id: branch!.id } })
    const taxAddedOnTop = config!.pricesIncludeTax ? 0 : order.body.taxTotal
    expect(order.body.grandTotal).toBe(
      order.body.subtotal - order.body.discountTotal + order.body.serviceChargeAmount + taxAddedOnTop,
    )

    const snapshot = await prisma.voucherSnapshot.findFirst({ where: { voucherId: voucher.id } })
    expect(snapshot).toBeTruthy()
    expect(snapshot!.code).toBe(code)
    expect(Number(snapshot!.appliedDiscount)).toBe(expectedDiscount)
    expect(Number(snapshot!.discountValue)).toBe(10)
    expect(order.body.voucherSnapshotId).toBe(snapshot!.id)

    const payment = await prisma.payment.findUnique({ where: { id: order.body.paymentId } })
    expect(Number(payment!.amount)).toBe(order.body.grandTotal)

    // 2) voucher hết hạn -> 400, KHÔNG tạo đơn
    const expiredCode = `EXP${Date.now()}`
    const expired = await prisma.voucher.create({
      data: {
        code: expiredCode,
        discountType: 'FIXED',
        discountValue: 10_000,
        startAt: new Date(Date.now() - 120_000),
        endAt: new Date(Date.now() - 60_000),
        status: 'ACTIVE',
      },
    })
    created.voucherIds.push(expired.id)
    const before = await prisma.order.count()
    const rejected = await api()
      .post(`/orders/create-order-for-guest/${guestId}?voucherCode=${expiredCode}`)
      .set(auth())
      .send([{ skuId: sku!.id, quantity: 1 }])
    expect([400, 422]).toContain(rejected.status)
    expect(await prisma.order.count()).toBe(before)

    // 3) mã không tồn tại -> 400
    const missing = await api()
      .post(`/orders/create-order-for-guest/${guestId}?voucherCode=KHONGCOMA${Date.now()}`)
      .set(auth())
      .send([{ skuId: sku!.id, quantity: 1 }])
    expect([400, 422]).toContain(missing.status)
  })

  it('tích hợp sổ cái: thu tiền mặt -> số dư từng tài khoản nhích đúng số kỳ vọng', async () => {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
    const table = await takeTable(branch!.id)
    const guestLogin = await api()
      .post('/guest/login')
      .send({ name: 'e2e số dư', tableNodeId: table!.id, token: table!.token })
      .expect(201)
    const guestId = guestLogin.body.guest.id as number
    created.guestIds.push(guestId)

    const sku = await prisma.sKU.findFirst({ where: { product: { deletedAt: null, status: 'ACTIVE' } }, orderBy: { id: 'asc' } })
    const order = await api()
      .post(`/orders/create-order-for-guest/${guestId}`)
      .set(auth())
      .send([{ skuId: sku!.id, quantity: 3 }])
      .expect(201)
    created.orderIds.push(order.body.id)
    created.paymentIds.push(order.body.paymentId)

    /** số dư tài khoản theo code, đọc từ API thật */
    const balances = async () => {
      const res = await api().get('/ledger-accounts?page=1&limit=100').set(auth()).expect(200)
      const map: Record<string, number> = {}
      for (const row of res.body.data) map[row.code] = row.balance
      return map
    }

    const before = await balances()
    await api().get(`/orders/pay-orders-by-guest/${guestId}`).set(auth()).expect(200)
    const after = await balances()

    const delta = (code: string) => Number((after[code] ?? 0) - (before[code] ?? 0))
    expect(delta('CASH')).toBe(order.body.grandTotal)
    // REVENUE_FOOD = tiền khách trả − phí phục vụ − thuế (giá menu đã gồm VAT nên thuế bị trích ra)
    expect(delta('REVENUE_FOOD')).toBe(order.body.grandTotal - order.body.serviceChargeAmount - order.body.taxTotal)
    expect(delta('SERVICE_CHARGE')).toBe(order.body.serviceChargeAmount)
    expect(delta('TAX_PAYABLE')).toBe(order.body.taxTotal)
    // bút toán phải CÂN: tổng nhích của Nợ = tổng nhích của Có
    expect(delta('CASH')).toBe(delta('REVENUE_FOOD') + delta('SERVICE_CHARGE') + delta('TAX_PAYABLE'))
  })

  it('tích hợp sổ cái: ghi sổ lỗi giữa transaction -> đơn và payment KHÔNG đổi trạng thái', async () => {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
    const table = await takeTable(branch!.id)
    const guestLogin = await api()
      .post('/guest/login')
      .send({ name: 'e2e rollback', tableNodeId: table!.id, token: table!.token })
      .expect(201)
    const guestId = guestLogin.body.guest.id as number
    created.guestIds.push(guestId)
    const sku = await prisma.sKU.findFirst({ where: { product: { deletedAt: null, status: 'ACTIVE' } }, orderBy: { id: 'asc' } })
    const order = await api()
      .post(`/orders/create-order-for-guest/${guestId}`)
      .set(auth())
      .send([{ skuId: sku!.id, quantity: 1 }])
      .expect(201)
    created.orderIds.push(order.body.id)
    created.paymentIds.push(order.body.paymentId)

    // giả lập sổ cái chết đúng lúc thu tiền
    const posting = app.get(LedgerPostingService)
    const spy = jest.spyOn(posting, 'postEntry').mockRejectedValueOnce(new Error('e2e: sổ cái chết'))
    const failed = await api().get(`/orders/pay-orders-by-guest/${guestId}`).set(auth())
    spy.mockRestore()

    expect(failed.status).toBeGreaterThanOrEqual(400)
    const payment = await prisma.payment.findUnique({ where: { id: order.body.paymentId } })
    const persistedOrder = await prisma.order.findUnique({ where: { id: order.body.id } })
    // rollback: chưa thu được tiền thì không được đánh dấu đã thu
    expect(payment!.status).toBe('PENDING')
    expect(persistedOrder!.status).toBe('PENDING')
    const entries = await prisma.ledgerEntry.count({ where: { refType: 'ORDER_PAID_CASH', refId: order.body.paymentId } })
    expect(entries).toBe(0)
  })

  it('tất toán cọc: Nợ DEPOSIT_LIABILITY / Có REVENUE_FOOD, idempotent theo reservation', async () => {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
    const table = await takeTable(branch!.id)
    const admin = await prisma.user.findFirst({ where: { email: 'admin@order.com' } })

    const reservation = await prisma.reservation.create({
      data: {
        userId: admin!.id,
        customerName: 'e2e cọc',
        customerPhone: '0900000000',
        guestCount: 2,
        reservationTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        hasPreOrder: false,
        tableNodeId: table!.id,
        branchId: branch!.id,
        depositAmount: 500_000,
        status: 'DEPOSITED',
      },
    })
    created.reservationIds.push(reservation.id)

    const posting = app.get(LedgerPostingService)
    const first = await posting.settleReservationDeposit({ reservationId: reservation.id, grandTotal: 2_000_000 })
    expect(first).toBeTruthy()
    // gọi lại: idempotent, không ghi thêm
    const second = await posting.settleReservationDeposit({ reservationId: reservation.id, grandTotal: 2_000_000 })
    expect(second?.created).toBe(false)

    const entries = await prisma.ledgerEntry.findMany({
      where: { refType: 'DEPOSIT_SETTLED', refId: reservation.id },
      include: { lines: { include: { account: { select: { code: true } } } } },
    })
    expect(entries).toHaveLength(1)
    const lines = entries[0].lines.map((line) => ({ code: line.account.code, direction: line.direction, amount: Number(line.amount) }))
    expect(lines).toEqual(
      expect.arrayContaining([
        { code: 'DEPOSIT_LIABILITY', direction: 'DEBIT', amount: 500_000 },
        { code: 'REVENUE_FOOD', direction: 'CREDIT', amount: 500_000 },
      ]),
    )
    expect(entries[0].status).toBe('POSTED')
  })

  it('tất toán cọc: hoá đơn nhỏ hơn cọc -> chỉ tất toán phần dùng được', async () => {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
    const table = await takeTable(branch!.id)
    const admin = await prisma.user.findFirst({ where: { email: 'admin@order.com' } })
    const reservation = await prisma.reservation.create({
      data: {
        userId: admin!.id,
        customerName: 'e2e cọc nhỏ',
        customerPhone: '0900000001',
        guestCount: 1,
        reservationTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        hasPreOrder: false,
        tableNodeId: table!.id,
        branchId: branch!.id,
        depositAmount: 500_000,
        status: 'DEPOSITED',
      },
    })
    created.reservationIds.push(reservation.id)

    const posting = app.get(LedgerPostingService)
    await posting.settleReservationDeposit({ reservationId: reservation.id, grandTotal: 300_000 })
    const entry = await prisma.ledgerEntry.findFirst({
      where: { refType: 'DEPOSIT_SETTLED', refId: reservation.id },
      include: { lines: true },
    })
    expect(entry).toBeTruthy()
    // 500k cọc nhưng hoá đơn 300k -> chỉ chuyển 300k sang doanh thu, phần dư vẫn là nợ khách
    expect(entry!.lines.reduce((sum, line) => sum + Number(line.amount), 0)).toBe(600_000)
    expect(Math.max(...entry!.lines.map((line) => Number(line.amount)))).toBe(300_000)
  })

  it('COGS: đơn 2 món khác recipe -> bút toán Nợ COGS / Có INVENTORY đúng định lượng × đơn giá', async () => {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
    const table = await takeTable(branch!.id)
    const guestLogin = await api()
      .post('/guest/login')
      .send({ name: 'e2e cogs', tableNodeId: table!.id, token: table!.token })
      .expect(201)
    const guestId = guestLogin.body.guest.id as number
    created.guestIds.push(guestId)

    // 2 món khác nhau, mỗi món 1 recipe riêng
    const skus = await prisma.sKU.findMany({
      where: { product: { deletedAt: null, status: 'ACTIVE' } },
      orderBy: { id: 'asc' },
      take: 2,
    })
    expect(skus.length).toBe(2)
    const unit = await prisma.unit.findFirst({ where: { name: { in: ['kg', 'g'] } }, orderBy: { name: 'asc' } })
    const ingredientA = await prisma.ingredient.create({
      data: { name: `e2e bò ${Date.now()}`, unitId: unit!.name, stock: 10, unitCost: 300_000 },
    })
    const ingredientB = await prisma.ingredient.create({
      data: { name: `e2e bánh ${Date.now()}`, unitId: unit!.name, stock: 10, unitCost: 40_000 },
    })
    created.ingredientIds.push(ingredientA.id, ingredientB.id)

    // Lua đọc tồn kho từ Redis -> nguyên liệu mới tạo phải có hash, nếu không sẽ báo thiếu hàng
    for (const ingredient of [ingredientA, ingredientB]) {
      const key = `ingredient:${ingredient.id}`
      stockBackup.set(key, {} as Record<string, string>)
      await redisServiceForTests().setHash(key, {
        stock: 1_000_000,
        minStock: 0,
        unitId: ingredient.unitId,
        name: ingredient.name,
      })
    }

    const recipeA = await prisma.sKURecipeIngredient.create({
      data: { skuId: skus[0].id, ingredientId: ingredientA.id, quantity: 0.2, unitId: unit!.name, createdById: 1 },
    })
    const recipeB = await prisma.sKURecipeIngredient.create({
      data: { skuId: skus[1].id, ingredientId: ingredientB.id, quantity: 0.1, unitId: unit!.name, createdById: 1 },
    })
    created.recipeIds.push(recipeA.id, recipeB.id)

    // Cache recipe trên Redis là thứ Lua đọc khi trừ kho -> phải cập nhật, và trả lại sau test
    for (const sku of skus) {
      const key = `recipe:${sku.id}`
      if (!recipeBackup.has(key)) recipeBackup.set(key, await redisServiceForTests().getJson(key))
    }
    await redisServiceForTests().setJson(`recipe:${skus[0].id}`, [
      { ingredientId: ingredientA.id, quantity: 0.2, unitId: unit!.name },
    ])
    await redisServiceForTests().setJson(`recipe:${skus[1].id}`, [
      { ingredientId: ingredientB.id, quantity: 0.1, unitId: unit!.name },
    ])

    const order = await api()
      .post(`/orders/create-order-for-guest/${guestId}`)
      .set(auth())
      .send([
        { skuId: skus[0].id, quantity: 2 },
        { skuId: skus[1].id, quantity: 1 },
      ])
      .expect(201)
    created.orderIds.push(order.body.id)
    created.paymentIds.push(order.body.paymentId)

    await api().get(`/orders/pay-orders-by-guest/${guestId}`).set(auth()).expect(200)

    // 2 × 0,2 × 300.000 + 1 × 0,1 × 40.000 = 124.000
    const entry = await prisma.ledgerEntry.findFirst({
      where: { refType: 'ORDER_COGS', refId: order.body.id },
      include: { lines: { include: { account: { select: { code: true } } } } },
    })
    expect(entry).toBeTruthy()
    const lines = entry!.lines.map((line) => ({ code: line.account.code, direction: line.direction, amount: Number(line.amount) }))
    expect(lines).toEqual(
      expect.arrayContaining([
        { code: 'COGS', direction: 'DEBIT', amount: 124_000 },
        { code: 'INVENTORY', direction: 'CREDIT', amount: 124_000 },
      ]),
    )

    // báo cáo doanh thu đọc COGS từ sổ -> cột cogs phải lên số (dựng lại projection của hôm nay)
    const today = vnToday()
    await api().post('/reports/revenue/recompute').set(auth()).send({ fromDate: today, toDate: today, branchId: branch!.id }).expect(201)
    const report = await api().get(`/reports/revenue?fromDate=${today}&toDate=${today}&branchId=${branch!.id}`).set(auth()).expect(200)
    expect(report.body.totals.cogs).toBeGreaterThanOrEqual(124_000)
  })

  it('vai trò đặt sẵn KE_TOAN: đọc được sổ quỹ / báo cáo, không ghi được đơn hay xem nhân viên', async () => {
    const role = await prisma.role.findFirst({ where: { name: 'KE_TOAN' } })
    expect(role).toBeTruthy()

    const email = `e2e-kt-${Date.now()}@example.com`
    const createdUser = await api()
      .post('/users')
      .set(auth())
      .send({ email, password: '123456', name: 'Ke Toan E2E', roleId: role!.id, status: 'ACTIVE' })
      .expect(201)
    created.userIds.push(createdUser.body.id)

    const token = (await api().post('/auth/login').send({ email, password: '123456' }).expect(201)).body
      .accessToken as string
    const asAccountant = () => ({ Authorization: `Bearer ${token}` })

    // ĐỌC tài chính: phải được
    await api().get('/ledger/cash-book').set(asAccountant()).expect(200)
    await api().get('/reports/revenue').set(asAccountant()).expect(200)
    await api().get('/ledger/entries').set(asAccountant()).expect(200)

    // GHI nghiệp vụ và xem dữ liệu nhân sự: phải bị chặn
    await api().get('/users').set(asAccountant()).expect(403)
    await api().post('/tables').set(asAccountant()).send({}).expect(403)
    // sửa quyền: tuyệt đối không
    await api().put(`/role/${role!.id}/permissions`).set(asAccountant()).send({ permissionIds: [] }).expect(403)
  })

  it('phân quyền: thu hồi 1 quyền của STAFF -> bị 403 ngay, trả lại -> vào được', async () => {
    const staffRole = await prisma.role.findFirst({ where: { name: 'STAFF' } })
    const email = `e2e-perm-${Date.now()}@example.com`

    const staffRes = await api()
      .post('/users')
      .set(auth())
      .send({ email, password: '123456', name: 'NV Phân Quyền', roleId: staffRole!.id, status: 'ACTIVE' })
      .expect(201)
    const userId = staffRes.body.id as number
    created.userIds.push(userId)

    const staffToken = (await api().post('/auth/login').send({ email, password: '123456' }).expect(201)).body
      .accessToken as string
    const staffAuth = () => ({ Authorization: `Bearer ${staffToken}` })

    // cần một route STAFF đang CÓ quyền để thu hồi
    const matrix = await api().get(`/role/${staffRole!.id}/permissions`).set(auth()).expect(200)
    const originalIds: number[] = matrix.body.data.permissions
      .filter((permission: any) => permission.granted)
      .map((permission: any) => permission.id)
    const target = matrix.body.data.permissions.find(
      (permission: any) => permission.granted && permission.method === 'GET' && permission.path === '/tables',
    )
    expect(target).toBeTruthy()

    try {
      // 1. trước khi thu hồi: STAFF gọi được
      await api().get('/tables').set(staffAuth()).expect(200)

      // 2. thu hồi quyền GET /tables
      await api()
        .put(`/role/${staffRole!.id}/permissions`)
        .set(auth())
        .send({ permissionIds: originalIds.filter((id) => id !== target.id) })
        .expect(200)
      await api().get('/tables').set(staffAuth()).expect(403)

      // 3. ADMIN không được tự bỏ quyền của chính mình (khoá role ADMIN)
      const adminRole = await prisma.role.findFirst({ where: { name: 'ADMIN' } })
      await api()
        .put(`/role/${adminRole!.id}/permissions`)
        .set(auth())
        .send({ permissionIds: [] })
        .expect(403) // CannotUpdateAdminRoleException là ForbiddenException
    } finally {
      // trả lại nguyên trạng, kể cả khi assert ở trên fail (không để lại quyền bị cắt)
      await api().put(`/role/${staffRole!.id}/permissions`).set(auth()).send({ permissionIds: originalIds })
    }

    await api().get('/tables').set(staffAuth()).expect(200)
  })

  it('chi nhánh: tạo -> sửa -> login nhân viên trả đúng chi nhánh đang hoạt động', async () => {
    const code = `E2E${Date.now().toString().slice(-6)}`
    const createdRes = await api()
      .post('/branches')
      .set(auth())
      .send({ code, name: 'Chi nhánh E2E', address: '1 Đường Test' })
      .expect(201)
    const branchId = createdRes.body.data.id as number
    created.branchIds.push(branchId)

    // sửa tên + tắt hoạt động
    await api().put(`/branches/${branchId}`).set(auth()).send({ name: 'Chi nhánh E2E (sửa)' }).expect(200)

    // danh sách phải có chi nhánh mới kèm số nhân viên/bàn đang dùng
    const list = await api().get('/branches').set(auth()).expect(200)
    const row = list.body.data.find((item: any) => item.id === branchId)
    expect(row).toBeTruthy()
    expect(row.name).toBe('Chi nhánh E2E (sửa)')
    expect(row.usage).toEqual(expect.objectContaining({ users: expect.any(Number) }))

    // tạo nhân viên thuộc chi nhánh đó rồi đăng nhập: phải trả về đúng chi nhánh
    const staffRole = await prisma.role.findFirst({ where: { name: 'STAFF' } })
    const email = `e2e-branch-${Date.now()}@example.com`
    const staffRes = await api()
      .post('/users')
      .set(auth())
      .send({
        email,
        password: '123456',
        name: 'NV Chi Nhánh',
        branchId,
        roleId: staffRole!.id,
        status: 'ACTIVE',
      })
      .expect(201)
    created.userIds.push(staffRes.body.id ?? staffRes.body.data?.id)
    expect(staffRes.body.branchId).toBe(branchId) // nhân viên lưu đúng chi nhánh

    // POST mặc định trả 201 trong Nest (không đổi contract của /auth/login)
    const login = await api().post('/auth/login').send({ email, password: '123456' }).expect(201)
    expect(login.body.user.branchId).toBe(branchId)
    expect(login.body.user.branch).toEqual(expect.objectContaining({ id: branchId, name: 'Chi nhánh E2E (sửa)' }))

    // BỎ GÁN chi nhánh (branchId = null) phải lưu thật vào DB — trước đây service bóc danh sách
    // trường cố định nên nuốt mất branchId: API trả 200 mà chi nhánh vẫn còn.
    const userId = created.userIds[created.userIds.length - 1]
    await api()
      .put(`/users/${userId}`)
      .set(auth())
      .send({
        email,
        name: 'NV Chi Nhánh',
        branchId: null,
        roleId: staffRole!.id,
        status: 'ACTIVE',
        changePassword: false,
      })
      .expect(200)
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.branchId).toBeNull()

    // gán lại cũng phải lưu được (chiều ngược lại của cùng một lỗi)
    await api()
      .put(`/users/${userId}`)
      .set(auth())
      .send({
        email,
        name: 'NV Chi Nhánh',
        branchId,
        roleId: staffRole!.id,
        status: 'ACTIVE',
        changePassword: false,
      })
      .expect(200)
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.branchId).toBe(branchId)
  })

  it('tổng quan: đủ 4 ô tiền cho kỳ, có kỳ so sánh và % (null khi kỳ trước bằng 0)', async () => {
    const res = await api().get('/dashboard/overview').set(auth()).expect(200)
    const data = res.body.data

    // số cho các thẻ và biểu đồ (tiền mặt/ngân hàng, giảm giá, phụ thu, tip)
    for (const key of ['gross', 'tax', 'grandTotal', 'net', 'refund', 'discount', 'serviceCharge', 'tip', 'cashIn', 'vnpayIn']) {
      expect(typeof data[key]).toBe('number')
    }
    expect(typeof data.orderCount).toBe('number')
    expect(data.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // kỳ so sánh phải có thật, và không được trùng kỳ hiện tại
    expect(data.previous.toDate < data.fromDate).toBe(true)
    expect(data.lastMonth.toDate).toBeTruthy()
    // % chỉ là null khi mẫu số 0; nếu có thì phải là số hữu hạn
    for (const key of ['changeVsPrevious', 'changeVsLastMonth']) {
      if (data[key] !== null) expect(Number.isFinite(data[key])).toBe(true)
    }
    if (data.previous.net === 0) expect(data.changeVsPrevious).toBeNull()
  })

  it('tổng quan: kỳ 1 ngày so với hôm qua (kỳ trước = 1 ngày liền trước)', async () => {
    const res = await api().get('/dashboard/overview?fromDate=2026-03-10&toDate=2026-03-10').set(auth()).expect(200)
    const data = res.body.data
    expect(data.previous.fromDate).toBe('2026-03-09')
    expect(data.previous.toDate).toBe('2026-03-09')
    // cùng kỳ tháng trước: cùng ngày, lùi 1 tháng
    expect(data.lastMonth.fromDate).toBe('2026-02-10')
    expect(data.lastMonth.toDate).toBe('2026-02-10')
  })

  it('sổ quỹ: đầu kỳ + thu - chi = tồn, có Tiền mặt và Ngân hàng, có dòng tổng', async () => {
    const res = await api().get('/ledger/cash-book').set(auth()).expect(200)

    expect(res.body.data.accounts.map((item: any) => item.code)).toEqual(['CASH', 'BANK'])
    for (const account of res.body.data.accounts) {
      expect(account.closing).toBe(account.opening + account.inflow - account.outflow)
    }
    const sum = res.body.data.accounts.reduce(
      (acc: any, account: any) => ({
        opening: acc.opening + account.opening,
        inflow: acc.inflow + account.inflow,
        outflow: acc.outflow + account.outflow,
        closing: acc.closing + account.closing,
      }),
      { opening: 0, inflow: 0, outflow: 0, closing: 0 },
    )
    // dòng "Tổng quỹ" phải bằng tổng hai quỹ, không tính lại ra số khác
    expect(res.body.data.total).toEqual(sum)
    expect(res.body.data.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('danh mục: API liệt kê bản dịch của 1 danh mục (cho màn hình quản trị)', async () => {
    const category = await prisma.category.findFirst({
      where: { deletedAt: null },
      select: { id: true, categoryTranslations: { select: { id: true, languageId: true } } },
    })
    expect(category).toBeTruthy()

    const list = await api().get(`/category-translation?categoryId=${category!.id}`).set(auth()).expect(200)
    expect(Array.isArray(list.body.data)).toBe(true)
    expect(list.body.data.every((item: any) => item.categoryId === category!.id)).toBe(true)
    // bản dịch tiếng Việt (nếu có) phải đứng đầu để form mặc định đúng bản gốc
    if (list.body.data.length > 1) {
      expect(list.body.data[0].languageId).toBe('vi')
    }
    expect(list.body.data.length).toBeGreaterThanOrEqual(category!.categoryTranslations.length)
  })

  it('đa ngôn ngữ: en trả en, vi trả vi, thiếu bản dịch thì rơi về vi', async () => {
    // Sản phẩm có sẵn bản dịch tiếng Việt -> thêm bản dịch tiếng Anh để chứng minh chọn đúng ngôn ngữ
    const product = await prisma.product.findFirst({
      where: { deletedAt: null, productTranslations: { some: { languageId: 'vi' } } },
      select: { id: true, name: true, productTranslations: { select: { languageId: true, name: true } } },
    })
    expect(product).toBeTruthy()
    const viName = product!.productTranslations.find((item) => item.languageId === 'vi')!.name
    const enName = `e2e EN ${Date.now()}`
    await prisma.productTranslation.create({
      data: { productId: product!.id, languageId: 'en', name: enName, description: 'e2e en desc' },
    })

    try {
      const en = await api().get(`/product/detail/${product!.id}`).set({ 'X-Locale': 'en' }).expect(200)
      expect(en.body.name).toBe(enName)
      expect(en.body.productTranslations).toHaveLength(1)
      expect(en.body.productTranslations[0].languageId).toBe('en')

      const vi = await api().get(`/product/detail/${product!.id}`).expect(200)
      expect(vi.body.name).toBe(viName)
      expect(vi.body.productTranslations[0].languageId).toBe('vi')

      // ?lang= thắng header, ngôn ngữ không hỗ trợ thì rơi về vi
      const queryWins = await api()
        .get(`/product/detail/${product!.id}?lang=vi`)
        .set({ 'X-Locale': 'en' })
        .expect(200)
      expect(queryWins.body.name).toBe(viName)

      const unsupported = await api().get(`/product/detail/${product!.id}?lang=fr`).expect(200)
      expect(unsupported.body.name).toBe(viName)

      const acceptLanguage = await api()
        .get(`/product/detail/${product!.id}`)
        .set({ 'Accept-Language': 'en-US,en;q=0.9' })
        .expect(200)
      expect(acceptLanguage.body.name).toBe(enName)

      // danh mục: cùng một cơ chế
      const category = await prisma.category.findFirst({
        where: { deletedAt: null, parentCategoryId: null, categoryTranslations: { some: { languageId: 'vi' } } },
        select: { id: true, name: true, categoryTranslations: { select: { languageId: true, name: true } } },
      })
      const viCategoryName = category!.categoryTranslations.find((item) => item.languageId === 'vi')?.name ?? category!.name
      const enCategoryName = `e2e CAT EN ${Date.now()}`
      await prisma.categoryTranslation.create({
        data: { categoryId: category!.id, languageId: 'en', name: enCategoryName, description: 'e2e cat en' },
      })
      try {
        const catEn = await api().get('/category').set(auth()).set({ 'X-Locale': 'en' }).expect(200)
        const catRowEn = catEn.body.data.find((item: any) => item.id === category!.id)
        expect(catRowEn?.name).toBe(enCategoryName)

        const catVi = await api().get('/category').set(auth()).expect(200)
        const catRowVi = catVi.body.data.find((item: any) => item.id === category!.id)
        expect(catRowVi?.name).toBe(viCategoryName)
      } finally {
        await prisma.categoryTranslation.deleteMany({ where: { categoryId: category!.id, languageId: 'en' } })
      }
    } finally {
      await prisma.productTranslation.deleteMany({ where: { productId: product!.id, languageId: 'en' } })
    }
  })

  it('quản lý voucher: tạo -> dùng được -> tắt thì khách bị chặn -> xoá mềm', async () => {
    const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
    const table = await takeTable(branch!.id)
    const guestLogin = await api()
      .post('/guest/login')
      .send({ name: 'e2e voucher admin', tableNodeId: table!.id, token: table!.token })
      .expect(201)
    const guestId = guestLogin.body.guest.id as number
    created.guestIds.push(guestId)
    const sku = await prisma.sKU.findFirst({ where: { product: { deletedAt: null } }, orderBy: { id: 'asc' } })

    const code = `ADMIN${Date.now()}`.slice(0, 20)
    const createdVoucher = await api()
      .post('/vouchers')
      .set(auth())
      .send({
        code,
        discountType: 'PERCENT',
        discountValue: 10,
        startAt: new Date(Date.now() - 60_000).toISOString(),
        endAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        usageLimit: 3,
      })
      .expect(201)
    const voucherId = createdVoucher.body.data.id as number
    created.voucherIds.push(voucherId)
    expect(createdVoucher.body.data.code).toBe(code)
    expect(createdVoucher.body.data.usedCount).toBe(0)

    // chưa đăng nhập -> 401; STAFF (không có quyền VOUCHERS) -> 403
    expect((await api().get('/vouchers')).status).toBe(401)
    const staffRole = await prisma.role.findFirst({ where: { name: 'STAFF' } })
    const staffEmail = `staff-voucher-${Date.now()}@e2e.local`
    const bcrypt = await import('bcrypt')
    const staffUser = await prisma.user.create({
      data: {
        email: staffEmail,
        name: 'e2e voucher staff',
        password: await bcrypt.hash('123456', 10),
        status: 'ACTIVE',
        roleId: staffRole!.id,
      },
    })
    created.userIds.push(staffUser.id)
    const staffToken = (
      await api().post('/auth/login').send({ email: staffEmail, password: '123456' }).expect(201)
    ).body.accessToken as string
    expect((await api().get('/vouchers').set({ Authorization: `Bearer ${staffToken}` })).status).toBe(403)

    // trùng mã -> 409
    await api()
      .post('/vouchers')
      .set(auth())
      .send({
        code,
        discountType: 'FIXED',
        discountValue: 10000,
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 60_000).toISOString(),
      })
      .expect(409)

    // PERCENT > 100 -> 422 (validate schema)
    const invalid = await api()
      .post('/vouchers')
      .set(auth())
      .send({
        code: `${code}X`,
        discountType: 'PERCENT',
        discountValue: 150,
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 60_000).toISOString(),
      })
    expect([400, 422]).toContain(invalid.status)

    // danh sách thấy voucher + usableNow
    const list = await api().get(`/vouchers?search=${code}`).set(auth()).expect(200)
    const row = list.body.data.find((item: any) => item.id === voucherId)
    expect(row.usableNow).toBe(true)
    expect(row.usedCount).toBe(0)

    // dùng thật 2 lần -> usedCount = 2 (mỗi đơn phải vào created.* để teardown dọn sạch)
    for (let i = 0; i < 2; i += 1) {
      const usedOrder = await api()
        .post(`/orders/create-order-for-guest/${guestId}?voucherCode=${code}`)
        .set(auth())
        .send([{ skuId: sku!.id, quantity: 1 }])
        .expect(201)
      created.orderIds.push(usedOrder.body.id)
      created.paymentIds.push(usedOrder.body.paymentId)
    }
    const afterUse = await api().get(`/vouchers/${voucherId}`).set(auth()).expect(200)
    expect(afterUse.body.data.usedCount).toBe(2)

    // hạ usageLimit xuống dưới số lượt đã dùng -> 400 (usageLimit phải là số nguyên, nếu không sẽ 422)
    const lowered = await api()
      .put(`/vouchers/${voucherId}`)
      .set(auth())
      .send({
        code,
        discountType: 'PERCENT',
        discountValue: 10,
        startAt: new Date(Date.now() - 60_000).toISOString(),
        endAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        usageLimit: 1,
      })
    expect(lowered.status).toBe(400)
    expect(String(lowered.body.message)).toContain('2')

    // tắt voucher -> khách bị chặn khi áp mã
    await api().patch(`/vouchers/${voucherId}/status`).set(auth()).send({ status: 'INACTIVE' }).expect(200)
    const blocked = await api()
      .post(`/orders/create-order-for-guest/${guestId}?voucherCode=${code}`)
      .set(auth())
      .send([{ skuId: sku!.id, quantity: 1 }])
    expect([400, 422]).toContain(blocked.status)

    // xoá mềm -> không còn trong danh sách, chi tiết 404
    await api().delete(`/vouchers/${voucherId}`).set(auth()).expect(200)
    const afterDelete = await api().get(`/vouchers?search=${code}`).set(auth()).expect(200)
    expect(afterDelete.body.data.some((item: any) => item.id === voucherId)).toBe(false)
    expect((await api().get(`/vouchers/${voucherId}`).set(auth())).status).toBe(404)

    // tạo lại đúng mã vừa xoá mềm: cột code là unique ở DB nên phải 409 kèm lý do, KHÔNG được 500
    const recreate = await api()
      .post('/vouchers')
      .set(auth())
      .send({
        code,
        discountType: 'PERCENT',
        discountValue: 5,
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 60_000).toISOString(),
      })
    expect(recreate.status).toBe(409)
    expect(String(recreate.body.message)).toContain(code)
  })

  it('scope chi nhánh: token chi nhánh 1 không đọc được khu vực của chi nhánh khác', async () => {
    const other = await prisma.branch.create({
      data: { code: `E2E-${Date.now()}`, name: 'E2E chi nhánh phụ', address: 'e2e', isActive: true },
    })
    created.branchIds.push(other.id)
    const area = await prisma.area.create({ data: { name: `E2E khu ${Date.now()}`, branchId: other.id } })
    created.areaIds.push(area.id)

    const list = await api().get('/area?page=1&limit=100').set(auth()).expect(200)
    const ids = (list.body.data ?? []).map((row: any) => row.id)
    expect(ids).not.toContain(area.id)

    const detail = await api().get(`/area/${area.id}`).set(auth())
    expect([404, 422]).toContain(detail.status)
  })
})
