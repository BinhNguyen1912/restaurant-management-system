import { PrismaClient } from '@prisma/client'

/**
 * Xoá DỮ LIỆU DEMO do `npm run seed:demo` tạo ra.
 *
 * Vì sao cần: seed demo ghi **bút toán sổ cái thật** (idempotencyKey `seed:order-…`), nên chúng
 * hiện trong Sổ quỹ / Nhật ký sổ cái / Báo cáo doanh thu như doanh thu thật. Muốn số liệu phản
 * ánh đúng hoạt động thật thì phải dọn.
 *
 * Nguyên tắc:
 *  - CHỈ xoá bản ghi có dấu vết seed (`idempotencyKey`/`note` bắt đầu bằng `seed:`, hoặc
 *    `reference = 'SEED-…'`), không dựa vào id.
 *  - KHÔNG xoá dữ liệu cấu trúc mà ứng dụng đang dùng (chi nhánh, bàn, khu vực, đơn vị, nguyên
 *    liệu, sản phẩm): xoá những thứ đó sẽ kéo theo dữ liệu thật. Script chỉ **báo cáo** chúng.
 *  - Không xoá tài khoản, không xoá chi nhánh.
 *
 * Chạy: npm run seed:demo:clear       (thêm --dry để xem trước)
 */
const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry')

const log = (label: string, value: unknown) => console.log(`  ${label}:`, value)

async function main() {
  console.log(DRY_RUN ? '=== CHẠY THỬ (không ghi gì) ===' : '=== XOÁ DỮ LIỆU DEMO ===')

  // 1. Bút toán seed -> các dòng của nó (cascade) + đơn/thanh toán tương ứng
  const seedEntries = await prisma.ledgerEntry.findMany({
    where: { idempotencyKey: { startsWith: 'seed:' } },
    select: { id: true, idempotencyKey: true, refId: true, refType: true },
  })
  log('bút toán seed', seedEntries.length)

  const orderIds = [...new Set(seedEntries.filter((e) => e.refType !== 'VNPAY_SETTLEMENT').map((e) => e.refId))]
  const payments = orderIds.length
    ? await prisma.payment.findMany({ where: { order: { some: { id: { in: orderIds } } } }, select: { id: true } })
    : []
  log('đơn demo sẽ xoá', orderIds)
  log('thanh toán demo sẽ xoá', payments.map((p) => p.id))

  // 2. Đặt bàn demo (note seed:...)
  const seedReservations = await prisma.reservation.findMany({
    where: { note: { startsWith: 'seed:' } },
    select: { id: true },
  })
  log('đặt bàn demo', seedReservations.map((r) => r.id))

  // 3. Payment intent demo
  const seedIntents = await prisma.paymentIntent.findMany({
    where: { reference: { startsWith: 'SEED-' } },
    select: { id: true, reference: true },
  })
  log('payment intent demo', seedIntents.map((i) => i.reference))

  if (DRY_RUN) {
    await reportWhatStays()
    return
  }

  await prisma.$transaction(async (tx) => {
    // thứ tự xoá theo khoá ngoại: con trước, cha sau
    if (orderIds.length) {
      await tx.productSKUSnapshot.deleteMany({ where: { orderId: { in: orderIds } } })
      await tx.order.deleteMany({ where: { id: { in: orderIds } } })
    }
    if (seedEntries.length) {
      await tx.ledgerLine.deleteMany({ where: { entryId: { in: seedEntries.map((e) => e.id) } } })
      await tx.ledgerEntry.deleteMany({ where: { id: { in: seedEntries.map((e) => e.id) } } })
    }
    if (payments.length) {
      await tx.payment.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } })
      // payment đã xoá -> các dòng sổ cái còn trỏ paymentId cũ (đã xoá cùng entry ở trên)
    }
    if (seedReservations.length) {
      await tx.reservation.deleteMany({ where: { id: { in: seedReservations.map((r) => r.id) } } })
    }
    if (seedIntents.length) {
      await tx.paymentIntent.deleteMany({ where: { id: { in: seedIntents.map((i) => i.id) } } })
    }
  })
  console.log('Đã xoá xong.')

  // Dự án dùng projection DailyBranchSummary cho báo cáo -> phải tính lại, nếu không báo cáo
  // vẫn giữ số của bút toán vừa xoá.
  console.log('\nBước tiếp theo (bắt buộc): tính lại projection báo cáo')
  console.log('  POST /reports/revenue/recompute  (hoặc đăng nhập UI → Báo cáo → Tính lại)')

  await reportWhatStays()
}

/** Báo cáo những thứ seed tạo ra mà script CỐ Ý không xoá, để người dùng tự quyết định */
async function reportWhatStays() {
  const [vouchers, reminders, reviews, seedGuests] = await Promise.all([
    prisma.voucher.count({ where: { code: { in: ['SEED10', 'SEED20'] } } }).catch(() => 0),
    prisma.reminders.count().catch(() => 0),
    prisma.review.count().catch(() => 0),
    prisma.guest.count({ where: { name: { startsWith: 'Khách seed' } } }).catch(() => 0),
  ])
  console.log('\nDữ liệu KHÔNG bị xoá (cấu trúc/nội dung đang dùng):')
  log('chi nhánh', await prisma.branch.count())
  log('bàn (TableNode)', await prisma.tableNode.count())
  log('nguyên liệu', await prisma.ingredient.count())
  log('sản phẩm', await prisma.product.count())
  log('voucher còn lại', vouchers)
  log('nhắc việc còn lại', reminders)
  log('đánh giá còn lại', reviews)
  log('khách còn lại', await prisma.guest.count())
  if (seedGuests) log('  (khách tên bắt đầu "Khách seed")', seedGuests)
}

main()
  .catch((error) => {
    console.error('Lỗi khi xoá dữ liệu demo:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
