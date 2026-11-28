import { PrismaClient } from '@prisma/client'
import { pruneLogs } from '@/shared/service/log-retention'
import { DEFAULT_PRUNE_LIMIT, isUsableLimit } from '@/shared/service/log-retention-policy'

/**
 * Dọn nhật ký quá thời hạn lưu (`AccessLog`, `LoginAttempt`) — docs/pii-retention-policy.md §3/§4.
 *
 *   npm run logs:prune -- --months=12                   (chạy thử: chỉ đếm, không xoá)
 *   npm run logs:prune -- --months=12 --apply           (xoá thật)
 *   npm run logs:prune -- --months=12 --apply --limit=20000
 *
 * `--months` bắt buộc và không có giá trị mặc định: con số do kế toán + luật sư chốt, script không
 * chọn hộ. Không có `--apply` thì KHÔNG xoá gì — đây là lệnh xoá bằng chứng, chạy nhầm là mất và
 * không lấy lại được.
 */
const prisma = new PrismaClient()
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const valueOf = (name: string) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`))
  return hit ? hit.slice(`--${name}=`.length) : undefined
}

function usage(problem: string): never {
  console.error(`Lỗi: ${problem}

Cách dùng:
  npm run logs:prune -- --months=12                          (chạy thử)
  npm run logs:prune -- --months=12 --apply                  (xoá thật)
  npm run logs:prune -- --months=12 --apply --limit=20000    (trần mỗi lần chạy, mặc định ${DEFAULT_PRUNE_LIMIT})`)
  process.exit(1)
}

async function main() {
  const monthsArg = valueOf('months')
  if (!monthsArg) usage('thiếu --months=N (thời hạn lưu do người ký chính sách chọn, script không chọn hộ)')

  const retentionMonths = Number(monthsArg)
  if (!Number.isFinite(retentionMonths) || retentionMonths <= 0) usage('--months phải là số tháng dương')

  const limitArg = valueOf('limit')
  const limit = limitArg === undefined ? undefined : Number(limitArg)
  if (limit !== undefined && !isUsableLimit(limit)) usage('--limit phải là số nguyên dương')

  console.log(apply ? '=== GHI THẬT ===' : '=== CHẠY THỬ (không xoá gì) ===')

  const summary = await pruneLogs(prisma, { now: new Date(), retentionMonths, apply, limit })

  console.log(`Mốc: xoá dòng tạo trước ${summary.cutoff.toISOString().slice(0, 10)} (${summary.retentionMonths} tháng)`)
  for (const row of summary.tables) {
    console.log(`${row.table.padEnd(12)}: quá hạn ${row.overdue} dòng, đã xoá ${row.deleted}`)
    if (apply && row.overdue > row.deleted) {
      console.log(
        `  -> còn ${row.overdue - row.deleted} dòng quá hạn: chạm trần ${summary.limit} dòng mỗi lần, chạy lại để dọn tiếp`,
      )
    }
  }

  if (!apply) {
    console.log('')
    console.log('Chạy thử: chưa xoá gì. Thêm --apply để thực hiện.')
    return
  }

  const total = summary.tables.reduce((sum, row) => sum + row.deleted, 0)
  console.log('')
  console.log(`Đã xoá ${total} dòng nhật ký.`)
  console.log('Dấu vết của lần chạy: log của cron, không phải AuditLog — lý do ở docs/pii-retention-policy.md §4.')
}

main()
  .catch((error) => {
    console.error('Lỗi khi dọn nhật ký:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
