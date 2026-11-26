import { PrismaClient } from '@prisma/client'

/**
 * Đóng các PHIÊN BÀN TREO: bàn đang `OCCUPIED` nhưng **không còn khách đang mở và không có đơn
 * chưa thanh toán**.
 *
 * Vì sao cần: từ khi bàn phải do nhân viên mở, bàn đã mở sẽ **không tự đóng** khi khách rời
 * (đúng thiết kế — tránh khách tắt app là bàn về trống khi vẫn có người ngồi). Nhưng nếu nhân
 * viên quên đóng, hoặc dữ liệu test để lại, bàn sẽ kẹt "Có khách" mãi dù không có đơn nào.
 *
 * Script KHÔNG đóng bàn đang có người thật. Chỉ đóng khi CẢ BA điều đúng:
 *  1. không còn phiên khách còn hiệu lực (`refreshTokenExpiresAt` ở tương lai),
 *  2. không còn đơn chưa thanh toán (PENDING/CONFIRMED/PREPARING/READY),
 *  3. bàn đã mở quá `--hours` giờ (mặc định 12) — tránh đóng bàn nhân viên vừa mở, đang chờ khách.
 *
 * Chạy: npm run tables:close-stale -- [--dry] [--hours=12]
 */
const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry')
const hoursArg = process.argv.find((arg) => arg.startsWith('--hours='))
const STALE_AFTER_HOURS = hoursArg ? Number(hoursArg.split('=')[1]) : 12
const staleThreshold = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000)

const OPEN_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] as const

async function main() {
  console.log(DRY_RUN ? '=== CHẠY THỬ (không ghi gì) ===' : '=== ĐÓNG PHIÊN BÀN TREO ===')

  console.log(`(chỉ đóng bàn mở quá ${STALE_AFTER_HOURS} giờ)`)

  const occupied = await prisma.tableNode.findMany({
    where: { status: 'OCCUPIED', deletedAt: null },
    select: { id: true, name: true, openedAt: true },
    orderBy: { id: 'asc' },
  })

  const stale: number[] = []
  for (const table of occupied) {
    const now = new Date()
    const [liveGuests, openOrders] = await Promise.all([
      prisma.guest.count({
        where: { tableNodeId: table.id, deletedAt: null, refreshTokenExpiresAt: { gt: now } },
      }),
      prisma.order.count({
        where: { tableNodeId: table.id, deletedAt: null, status: { in: [...OPEN_ORDER_STATUSES] } },
      }),
    ])
    const oldEnough = !table.openedAt || table.openedAt < staleThreshold
    if (liveGuests === 0 && openOrders === 0 && oldEnough) {
      stale.push(table.id)
      console.log(
        `  TREO  #${table.id} ${table.name} — mở lúc ${table.openedAt?.toISOString().slice(0, 16) ?? '?'} | khách đang mở 0, đơn chưa trả 0`,
      )
    } else {
      console.log(`  GIỮ   #${table.id} ${table.name} — khách đang mở ${liveGuests}, đơn chưa trả ${openOrders}`)
    }
  }

  if (DRY_RUN) {
    console.log(`\nSẽ đóng ${stale.length}/${occupied.length} bàn.`)
    return
  }

  if (stale.length) {
    await prisma.tableNode.updateMany({
      where: { id: { in: stale } },
      data: { status: 'AVAILABLE', openedAt: null, openedById: null },
    })
  }
  console.log(`\nĐã đóng ${stale.length}/${occupied.length} bàn treo.`)
}

main()
  .catch((error) => {
    console.error('Lỗi khi đóng phiên bàn treo:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
