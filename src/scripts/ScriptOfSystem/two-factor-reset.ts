import { PrismaClient } from '@prisma/client'
import { resetTwoFactorForUser } from '@/shared/service/two-factor-reset'

/**
 * Xoá 2FA của một tài khoản khi người dùng MẤT THIẾT BỊ (prod-readiness §M9 mục 5).
 *
 *   npm run security:2fa-reset -- --email=admin@quan.vn --actor=ops@quan.vn --reason="Mất điện thoại, đã xác minh qua CCCD"
 *   npm run security:2fa-reset -- ... --apply
 *
 * Không có `--apply` thì chỉ in ra sẽ làm gì: đây là lệnh THÁO rào chắn bảo vệ tài khoản cao nhất
 * trong hệ thống, chạy nhầm email là mở toang tài khoản người khác.
 *
 * Phần logic nằm ở `@/shared/service/two-factor-reset` để test được trên DB thật; script này chỉ đọc
 * tham số và in.
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
  npm run security:2fa-reset -- --email=<email tài khoản> --actor=<email người làm> --reason="<lý do>" [--apply]

  --email   bắt buộc — tài khoản bị xoá 2FA
  --actor   bắt buộc — ai làm việc này; không có tên thì dòng nhật ký không trả lời được câu hỏi duy nhất nó phải trả lời
  --reason  bắt buộc — vì sao (mất điện thoại, đổi máy, ...)
  --apply   thực hiện thật; thiếu cờ này thì chỉ in ra sẽ làm gì`)
  process.exit(1)
}

async function main() {
  const email = valueOf('email')
  const actorEmail = valueOf('actor')
  const reason = valueOf('reason')?.trim()

  if (!email) usage('thiếu --email=<email tài khoản>')
  if (!actorEmail) usage('thiếu --actor=<email người làm>')
  if (!reason) usage('thiếu --reason="<lý do>"')

  const result = await resetTwoFactorForUser(prisma, { email, actorEmail, reason, apply })

  if (result.status === 'NOT_FOUND') {
    console.error(`Không có tài khoản ${result.email} (hoặc đã bị xoá).`)
    process.exitCode = 1
    return
  }

  const { target, actor } = result
  console.log(apply ? '=== GHI THẬT ===' : '=== CHẠY THỬ (không sửa gì) ===')
  console.log(`Tài khoản   : ${target.email} (${target.name}, ${target.roleName}, id=${target.id})`)
  console.log(
    `2FA hiện tại: ${target.twoFactorEnabled ? 'đang bật' : 'đang tắt'}${target.hasPendingSecret ? ', có bí mật đang chờ' : ''}`,
  )
  console.log(
    actor
      ? `Người làm   : ${actor.email} (${actor.roleName}, id=${actor.id})`
      : `Người làm   : ${result.actorEmail} — KHÔNG có trong hệ thống; nhật ký sẽ ghi actorId=null`,
  )
  console.log(`Lý do       : ${result.reason}`)
  console.log('')

  if (result.status === 'DRY_RUN') {
    console.log('Sẽ làm: xoá bí mật 2FA + đặt twoFactorEnabled=false, thu hồi MỌI refresh token của tài khoản,')
    console.log('        ghi 1 dòng AuditLog TWO_FACTOR_RESET (kèm lý do).')
    console.log('Thêm --apply để thực hiện.')
    return
  }

  console.log(`Đã xoá 2FA của ${target.email} (id=${target.id}) và thu hồi ${result.revokedRefreshTokens} refresh token.`)
  console.log('')
  console.log('Người dùng: đăng nhập lại bằng mật khẩu, rồi bật 2FA từ đầu (POST /auth/2fa/setup -> enable).')
  console.log('Access token đã cấp trước đó vẫn dùng được tới khi hết hạn — thu hồi refresh token không thu hồi access token.')
}

main()
  .catch((error) => {
    console.error('Lỗi khi xoá 2FA:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
