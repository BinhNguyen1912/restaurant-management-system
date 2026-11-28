import { PrismaClient } from '@prisma/client'
import { anonymizeByRequest, anonymizeExpired } from '@/routes/customer/customer.anonymize'

/**
 * Ẩn danh hoá dữ liệu cá nhân của khách (NĐ 13/2023/NĐ-CP).
 *
 * Hai chế độ:
 *   npm run pii:anonymize -- --months=24 [--apply] [--limit=200]
 *        quét hồ sơ đã hết thời hạn lưu (mặc định CHẠY THỬ, chỉ in ra sẽ làm gì)
 *
 *   npm run pii:anonymize -- --customer=37 [--apply]
 *        xoá dữ liệu của MỘT khách theo yêu cầu của chính họ (không phụ thuộc thời hạn lưu)
 *
 * `--months` không có giá trị mặc định và là tham số bắt buộc: thời hạn lưu do kế toán + luật sư
 * chốt trong docs/pii-retention-policy.md §3. Script từ chối chạy khi thiếu tham số thay vì chọn hộ
 * — một con số pháp lý không được sinh ra từ sự tiện tay của lập trình viên.
 */
const prisma = new PrismaClient()
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const valueOf = (name: string) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`))
  return hit ? hit.slice(`--${name}=`.length) : undefined
}

function usage(problem: string): never {
  console.error(`Lỗi: ${problem}\n
Cách dùng:
  npm run pii:anonymize -- --months=24              (chạy thử)
  npm run pii:anonymize -- --months=24 --apply      (ghi thật)
  npm run pii:anonymize -- --customer=37 --apply    (xoá theo yêu cầu của khách)`)
  process.exit(1)
}

async function main() {
  const monthsArg = valueOf('months')
  const customerArg = valueOf('customer')

  if (monthsArg && customerArg) usage('--months và --customer loại trừ nhau')
  if (!monthsArg && !customerArg) usage('thiếu --months=N (hoặc --customer=ID)')

  console.log(apply ? '=== GHI THẬT ===' : '=== CHẠY THỬ (không ghi gì) ===')

  if (customerArg) {
    const customerId = Number(customerArg)
    if (!Number.isInteger(customerId) || customerId <= 0) usage('--customer phải là số nguyên dương')
    const result = await anonymizeByRequest(prisma, customerId, { apply })
    if (result.status === 'not-found') {
      console.log(`Không có hồ sơ khách #${customerId}.`)
      return
    }
    if (result.status === 'already') {
      console.log(`Hồ sơ #${customerId} đã ẩn danh trước đó — không làm gì.`)
      return
    }
    if (result.status === 'preview') {
      console.log(
        `Sẽ ẩn danh hồ sơ #${customerId}: tên ${result.hasName ? 'CÓ' : 'không'}, email ${
          result.hasEmail ? 'CÓ' : 'không'
        }, ghi chú ${result.hasNote ? 'CÓ' : 'không'}.`,
      )
      return
    }
    console.log(`Đã ẩn danh hồ sơ #${customerId} (${result.reservations} lượt đặt bàn).`)
    return
  }

  const retentionMonths = Number(monthsArg)
  if (!Number.isFinite(retentionMonths) || retentionMonths <= 0) {
    usage('--months phải là số tháng dương')
  }
  const limitArg = valueOf('limit')
  const limit = limitArg ? Number(limitArg) : 200

  const summary = await anonymizeExpired(prisma, { retentionMonths, apply, limit })

  console.log(`Mốc hết hạn lưu: trước ${summary.cutoff.toISOString().slice(0, 10)} (${retentionMonths} tháng)`)
  console.log(`Quét ${summary.scanned} hồ sơ, đủ điều kiện ${summary.eligible.length}:`)
  for (const row of summary.eligible) {
    console.log(`  #${row.id} — hoạt động cuối ${row.lastActivityAt.toISOString().slice(0, 10)}`)
  }
  if (!apply) {
    console.log('\nChạy thử: chưa ghi gì. Thêm --apply để thực hiện.')
    return
  }
  console.log(
    `\nĐã ẩn danh ${summary.anonymized} hồ sơ, ${summary.reservations} lượt đặt bàn theo hồ sơ, ${summary.unlinkedReservations} lượt đặt bàn không gắn hồ sơ.`,
  )
}

main()
  .catch((error) => {
    console.error('Lỗi khi ẩn danh hoá dữ liệu khách:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
