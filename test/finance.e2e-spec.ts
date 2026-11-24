import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/service/prisma.service'

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
  }
  let originalBranchSettings: { id: number; taxRate: string; serviceChargeRate: string; pricesIncludeTax: boolean } | null = null

  const api = () => request(app.getHttpServer())
  const auth = () => ({ Authorization: `Bearer ${token}` })

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
    if (created.branchIds.length) await attempt('branches', () => prisma.branch.deleteMany({ where: { id: { in: created.branchIds } } }))

    await app.close()
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

    const table = await prisma.tableNode.findFirst({ where: { branchId: branch!.id, status: 'AVAILABLE' }, orderBy: { id: 'asc' } })
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
