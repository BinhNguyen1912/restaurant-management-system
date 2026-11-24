import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/service/prisma.service'
import { LedgerPostingService } from '../src/shared/service/ledger-posting.service'

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
  const created: { shiftIds: number[]; orderIds: number[]; paymentIds: number[]; guestIds: number[]; areaIds: number[]; branchIds: number[] } = {
    shiftIds: [],
    orderIds: [],
    paymentIds: [],
    guestIds: [],
    areaIds: [],
    branchIds: [],
    reportEntryKeys: [] as string[],
    reconciliationRunIds: [] as number[],
    auditEntityIds: [] as number[],
    voucherIds: [] as number[],
  }
  let originalBranchSettings: { id: number; taxRate: string; serviceChargeRate: string; pricesIncludeTax: boolean } | null = null

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
    const today = new Date().toISOString().slice(0, 10)

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
