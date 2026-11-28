import { PrismaClient } from '@prisma/client'
import { TWO_FACTOR_REQUIRED_ROLES } from '@/shared/service/two-factor-enrolment-policy'

/**
 * Ai thuộc diện BẮT BUỘC 2FA và ai còn thiếu (prod-readiness §M9 mục 5) — chỉ đọc, không sửa gì.
 *
 *   npm run security:2fa-status
 *
 * Chạy TRƯỚC khi đặt `TWO_FACTOR_ENFORCEMENT=on`. Câu hỏi của lần bật đó không phải "cơ chế có chạy
 * không" mà là "bật lên thì ai bị chặn, và người đó có tự mở được không" — script trả lời đúng câu
 * đó, bằng số.
 */
const prisma = new PrismaClient()

async function main() {
  const enforced = process.env.TWO_FACTOR_ENFORCEMENT === 'on'
  const users = await prisma.user.findMany({
    where: { deletedAt: null, role: { name: { in: [...TWO_FACTOR_REQUIRED_ROLES] } } },
    select: {
      id: true,
      email: true,
      status: true,
      twoFactorEnabled: true,
      // Cần biết "đã quét QR nhưng chưa xác nhận" — những tài khoản này bật bắt buộc lên vẫn bị
      // chặn, và người vận hành hay đọc nhầm là "đã bật rồi". Bí mật đã mã hoá, in ra cũng vô nghĩa.
      totpSecret: true,
      role: { select: { name: true } },
    },
    orderBy: [{ email: 'asc' }],
  })

  console.log(
    `Chế độ: ${enforced ? 'BẮT BUỘC (TWO_FACTOR_ENFORCEMENT=on)' : 'chưa bắt buộc (TWO_FACTOR_ENFORCEMENT không đặt hoặc = off)'}`,
  )
  console.log(`Diện bắt buộc: ${TWO_FACTOR_REQUIRED_ROLES.join(', ')}`)
  console.log('')

  if (users.length === 0) {
    console.log('Không có tài khoản nào thuộc diện bắt buộc 2FA.')
    return
  }

  for (const user of users) {
    const mark = user.twoFactorEnabled ? '[đủ  ]' : '[THIẾU]'
    const pendingNote = !user.twoFactorEnabled && user.totpSecret ? '  (đã quét QR, CHƯA xác nhận)' : ''
    console.log(`${mark} ${user.email.padEnd(36)} ${user.role.name.padEnd(8)} ${user.status}${pendingNote}`)
  }

  const missing = users.filter((user) => !user.twoFactorEnabled)
  console.log('')
  console.log(`${users.length} tài khoản thuộc diện, ${missing.length} thiếu 2FA.`)

  if (missing.length > 0) {
    console.log('')
    console.log(`Bật TWO_FACTOR_ENFORCEMENT=on bây giờ: ${missing.length} tài khoản vẫn đăng nhập được nhưng chỉ gọi được`)
    console.log('  POST /auth/2fa/setup, POST /auth/2fa/enable, POST /auth/logout — mọi route khác trả 403')
    console.log('  Error.TwoFactorEnrolmentRequired, cho tới khi họ bật xong và gọi POST /auth/refresh-token.')
    console.log('')
    console.log('Người đã mất thiết bị (không tự bật được):')
    console.log('  npm run security:2fa-reset -- --email=<email> --actor=<email người làm> --reason="..." --apply')
  }
}

main()
  .catch((error) => {
    console.error('Lỗi khi đọc trạng thái 2FA:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
