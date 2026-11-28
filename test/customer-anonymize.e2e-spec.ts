import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/service/prisma.service'
import {
  anonymizeByRequest,
  anonymizeExpired,
  findAnonymizeCandidates,
} from '../src/routes/customer/customer.anonymize'
import {
  ANONYMIZED_NAME,
  ANONYMIZED_RESERVATION_PHONE,
  anonymizedPhone,
  retentionCutoff,
} from '../src/routes/customer/customer.anonymize-policy'

/**
 * Ẩn danh hoá hồ sơ khách (e2e thật: DB dev, chạy đúng module mà script dùng).
 *
 * Thứ cần chứng minh không phải "hàm chạy không lỗi" mà là **PII biến mất thật, và chỉ biến mất khi
 * được phép**: khách còn đơn đang mở thì giữ nguyên, khách mới thì giữ nguyên, chạy lần hai không
 * làm gì, và dòng nhật ký ẩn danh KHÔNG chép lại SĐT cũ (nếu chép thì việc ẩn danh vô nghĩa).
 */
describe('Customer anonymize (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  const PHONE_OLD = '0999000221'
  const PHONE_BUSY = '0999000222'
  const PHONE_NEW = '0999000223'
  const PHONE_UNLINKED_OLD = '0999000224'
  const PHONE_UNLINKED_NEW = '0999000225'

  /** 24 tháng: chỉ hồ sơ 3 năm tuổi trong test này hết hạn, không đụng dữ liệu dev khác. */
  const RETENTION_MONTHS = 24

  const yearsAgo = (years: number) => {
    const date = new Date()
    date.setUTCFullYear(date.getUTCFullYear() - years)
    return date
  }

  let oldCustomerId: number
  let busyCustomerId: number
  let newCustomerId: number
  let adminId: number
  let branchId: number
  let tableNodeId: number
  let oldReservationId: number
  let unlinkedOldReservationId: number
  let unlinkedNewReservationId: number
  let busyOrderId: number
  let busyPaymentId: number

  /**
   * Dọn dữ liệu test. Phải xoá theo ID đã tạo, không phải theo SĐT: sau khi ẩn danh, SĐT trong DB
   * đã thành `anonymized:<id>` nên tìm theo SĐT cũ sẽ không thấy gì.
   */
  const cleanup = async () => {
    const knownReservationIds = [oldReservationId, unlinkedOldReservationId, unlinkedNewReservationId].filter(
      (id): id is number => typeof id === 'number',
    )
    const knownCustomerIds = [oldCustomerId, busyCustomerId, newCustomerId].filter(
      (id): id is number => typeof id === 'number',
    )

    await prisma.reservation.deleteMany({
      where: {
        OR: [
          { id: { in: knownReservationIds } },
          { customerId: { in: knownCustomerIds } },
          { customerPhone: { in: [PHONE_UNLINKED_OLD, PHONE_UNLINKED_NEW] } },
        ],
      },
    })
    if (busyOrderId) await prisma.order.deleteMany({ where: { id: busyOrderId } })
    if (busyPaymentId) await prisma.payment.deleteMany({ where: { id: busyPaymentId } })
    // ConsentLog đi theo khách (Cascade); AuditLog là append-only nên dòng nhật ký ở lại, đúng thiết kế
    await prisma.customer.deleteMany({
      where: {
        OR: [{ id: { in: knownCustomerIds } }, { phone: { in: [PHONE_OLD, PHONE_BUSY, PHONE_NEW] } }],
      },
    })
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)

    await cleanup()

    const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@order.com' }, select: { id: true } })
    adminId = admin.id
    const branch = await prisma.branch.findFirstOrThrow({ where: { isActive: true }, select: { id: true } })
    branchId = branch.id
    const table = await prisma.tableNode.findFirstOrThrow({ where: { deletedAt: null }, select: { id: true } })
    tableNodeId = table.id

    const old = await prisma.customer.create({
      data: {
        phone: PHONE_OLD,
        name: 'Khách Cũ Ba Năm',
        email: 'cu@example.com',
        note: 'ghi chú có thông tin riêng',
        createdAt: yearsAgo(3),
      },
      select: { id: true },
    })
    oldCustomerId = old.id

    // hồ sơ cũ nhưng còn đơn chưa thu tiền ⇒ phải giữ nguyên
    const busy = await prisma.customer.create({
      data: { phone: PHONE_BUSY, name: 'Khách Còn Đơn', createdAt: yearsAgo(3) },
      select: { id: true },
    })
    busyCustomerId = busy.id
    const busyPayment = await prisma.payment.create({
      data: { status: 'PENDING', amount: 120_000, branchId },
      select: { id: true },
    })
    busyPaymentId = busyPayment.id
    const busyOrder = await prisma.order.create({
      data: {
        customerId: busyCustomerId,
        paymentId: busyPayment.id,
        status: 'PENDING',
        branchId,
        subtotal: 120_000,
        grandTotal: 120_000,
        createdAt: yearsAgo(3),
      },
      select: { id: true },
    })
    busyOrderId = busyOrder.id

    const fresh = await prisma.customer.create({
      data: { phone: PHONE_NEW, name: 'Khách Mới Hôm Nay', email: 'moi@example.com' },
      select: { id: true },
    })
    newCustomerId = fresh.id

    const oldReservation = await prisma.reservation.create({
      data: {
        userId: adminId,
        customerId: oldCustomerId,
        customerName: 'Khách Cũ Ba Năm',
        customerPhone: PHONE_OLD,
        guestCount: 2,
        reservationTime: yearsAgo(3),
        hasPreOrder: false,
        tableNodeId,
        branchId,
        note: 'khách dị ứng đậu phộng',
        createdAt: yearsAgo(3),
      },
      select: { id: true },
    })
    oldReservationId = oldReservation.id

    await prisma.consentLog.create({
      data: {
        customerId: oldCustomerId,
        purpose: 'MARKETING',
        version: '2025-01',
        granted: true,
        createdAt: yearsAgo(3),
      },
    })

    const unlinkedOld = await prisma.reservation.create({
      data: {
        userId: adminId,
        customerName: 'Khách Vãng Lai Cũ',
        customerPhone: PHONE_UNLINKED_OLD,
        guestCount: 1,
        reservationTime: yearsAgo(3),
        hasPreOrder: false,
        tableNodeId,
        branchId,
        createdAt: yearsAgo(3),
      },
      select: { id: true },
    })
    unlinkedOldReservationId = unlinkedOld.id

    const unlinkedNew = await prisma.reservation.create({
      data: {
        userId: adminId,
        customerName: 'Khách Vãng Lai Mới',
        customerPhone: PHONE_UNLINKED_NEW,
        guestCount: 1,
        reservationTime: new Date(),
        hasPreOrder: false,
        tableNodeId,
        branchId,
      },
      select: { id: true },
    })
    unlinkedNewReservationId = unlinkedNew.id
  })

  afterAll(async () => {
    await cleanup()
    await app.close()
  })

  it('chỉ hồ sơ quá hạn VÀ không còn đơn đang mở mới được ẩn danh', async () => {
    const candidates = await findAnonymizeCandidates(prisma, retentionCutoff(new Date(), RETENTION_MONTHS), 500)
    const ids = candidates.map((candidate) => candidate.id)

    // SQL chỉ lọc theo mốc thời gian; nó vẫn trả hồ sơ còn đơn đang mở, kèm số đơn để policy quyết
    expect(ids).toContain(oldCustomerId)
    expect(ids).toContain(busyCustomerId)
    expect(candidates.find((candidate) => candidate.id === busyCustomerId)?.openOrders).toBe(1)
    expect(ids).not.toContain(newCustomerId) // hồ sơ mới: chưa tới mốc

    // lớp thứ hai — quyết định thật — loại hồ sơ còn đơn đang mở
    const summary = await anonymizeExpired(prisma, { retentionMonths: RETENTION_MONTHS, apply: false })
    const eligibleIds = summary.eligible.map((row) => row.id)
    expect(eligibleIds).toContain(oldCustomerId)
    expect(eligibleIds).not.toContain(busyCustomerId)
    expect(eligibleIds).not.toContain(newCustomerId)
  })

  it('chạy thử không ghi gì', async () => {
    const summary = await anonymizeExpired(prisma, { retentionMonths: RETENTION_MONTHS, apply: false })

    expect(summary.eligible.map((row) => row.id)).toContain(oldCustomerId)
    expect(summary.anonymized).toBe(0)

    const untouched = await prisma.customer.findUniqueOrThrow({ where: { id: oldCustomerId } })
    expect(untouched.phone).toBe(PHONE_OLD)
    expect(untouched.name).toBe('Khách Cũ Ba Năm')
    expect(untouched.anonymizedAt).toBeNull()
  })

  it('ẩn danh thật: PII của khách và của lượt đặt bàn biến mất, nhật ký không chép lại PII', async () => {
    await anonymizeExpired(prisma, { retentionMonths: RETENTION_MONTHS, apply: true })

    const erased = await prisma.customer.findUniqueOrThrow({ where: { id: oldCustomerId } })
    expect(erased.phone).toBe(anonymizedPhone(oldCustomerId))
    expect(erased.name).toBe(ANONYMIZED_NAME)
    expect(erased.email).toBeNull()
    expect(erased.note).toBeNull()
    expect(erased.anonymizedAt).not.toBeNull()

    const reservation = await prisma.reservation.findUniqueOrThrow({ where: { id: oldReservationId } })
    expect(reservation.customerName).toBe(ANONYMIZED_NAME)
    expect(reservation.customerPhone).toBe(ANONYMIZED_RESERVATION_PHONE)
    expect(reservation.note).toBeNull()

    // đơn hàng vẫn trỏ tới hồ sơ: hoá đơn là chứng từ kế toán, không được đứt
    const busyOrder = await prisma.order.findUniqueOrThrow({ where: { id: busyOrderId } })
    expect(busyOrder.customerId).toBe(busyCustomerId)

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CUSTOMER_ANONYMIZED', entityId: oldCustomerId },
      orderBy: { id: 'desc' },
    })
    expect(audit.entityType).toBe('CUSTOMER')
    expect(audit.reason).toContain('NĐ 13/2023')
    // AuditLog là append-only: nếu before/after chép SĐT/tên cũ thì ẩn danh bị vô hiệu từ đây
    expect(JSON.stringify(audit.before)).not.toContain(PHONE_OLD)
    expect(JSON.stringify(audit.after)).not.toContain(PHONE_OLD)
    expect(JSON.stringify(audit.before)).not.toContain('Khách Cũ Ba Năm')
  })

  it('lượt đặt bàn không gắn hồ sơ vẫn bị ẩn danh theo tuổi của chính nó', async () => {
    const masked = await prisma.reservation.findUniqueOrThrow({
      where: { id: unlinkedOldReservationId },
    })
    expect(masked.customerName).toBe(ANONYMIZED_NAME)
    expect(masked.customerPhone).toBe(ANONYMIZED_RESERVATION_PHONE)

    const recent = await prisma.reservation.findUniqueOrThrow({
      where: { id: unlinkedNewReservationId },
    })
    expect(recent.customerName).toBe('Khách Vãng Lai Mới')
    expect(recent.customerPhone).toBe(PHONE_UNLINKED_NEW)
  })

  it('khách còn đơn đang mở và khách mới vẫn nguyên vẹn', async () => {
    const busy = await prisma.customer.findUniqueOrThrow({ where: { id: busyCustomerId } })
    expect(busy.phone).toBe(PHONE_BUSY)
    expect(busy.anonymizedAt).toBeNull()

    const fresh = await prisma.customer.findUniqueOrThrow({ where: { id: newCustomerId } })
    expect(fresh.phone).toBe(PHONE_NEW)
    expect(fresh.email).toBe('moi@example.com')
  })

  it('chạy lại không làm gì (nhờ anonymizedAt)', async () => {
    const summary = await anonymizeExpired(prisma, { retentionMonths: RETENTION_MONTHS, apply: true })
    expect(summary.eligible.map((row) => row.id)).not.toContain(oldCustomerId)
    expect(summary.anonymized).toBe(0)
  })

  it('xoá theo yêu cầu của khách: không cần chờ hết thời hạn lưu, nhưng vẫn phải --apply mới ghi', async () => {
    const preview = await anonymizeByRequest(prisma, newCustomerId, { apply: false })
    expect(preview.status).toBe('preview')
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: newCustomerId } })).phone).toBe(PHONE_NEW)

    const done = await anonymizeByRequest(prisma, newCustomerId, { apply: true })
    expect(done.status).toBe('done')
    const erased = await prisma.customer.findUniqueOrThrow({ where: { id: newCustomerId } })
    expect(erased.phone).toBe(anonymizedPhone(newCustomerId))
    expect(erased.email).toBeNull()

    // gọi lần hai: không làm gì, không ghi thêm nhật ký
    const again = await anonymizeByRequest(prisma, newCustomerId, { apply: true })
    expect(again.status).toBe('already')

    const auditCount = await prisma.auditLog.count({
      where: { action: 'CUSTOMER_ANONYMIZED', entityId: newCustomerId },
    })
    expect(auditCount).toBe(1)

    expect((await anonymizeByRequest(prisma, 999_999_999, { apply: true })).status).toBe('not-found')
  })
})
