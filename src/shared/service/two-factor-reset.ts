import { PrismaClient } from '@prisma/client'

/**
 * Xoá 2FA của một tài khoản bởi NGƯỜI VẬN HÀNH — đường phục hồi khi người dùng mất thiết bị
 * (prod-readiness §M9 mục 5).
 *
 * Vì sao phải có: 2FA mà không có phục hồi thì mất điện thoại là mất tài khoản, và với quản trị viên
 * duy nhất là mất hệ thống. Lời giải duy nhất còn lại lúc đó là mở DB sửa tay — không có dòng nhật
 * ký nào, trong khi đây chính là thao tác PHÁ rào chắn bảo vệ cao nhất trong hệ thống.
 *
 * Bốn ràng buộc:
 *  - `reason` và `actorEmail` **bắt buộc**: một bản ghi "ai xoá 2FA của ai, vì sao" mà thiếu vế nào
 *    thì không trả lời được câu hỏi duy nhất nó tồn tại để trả lời.
 *  - `apply = false` thì **không ghi gì** — chỉ đọc và trả về trạng thái hiện tại.
 *  - Thu hồi **mọi refresh token** của tài khoản: reset là để xử lý tình huống thiết bị có thể đã
 *    mất/rơi vào tay người khác, nên phiên khác phải đăng nhập lại. Access token đã cấp vẫn sống tới
 *    khi hết hạn — không có cơ chế thu hồi access token trong hệ thống này.
 *  - Ghi `AuditLog` trong CÙNG transaction với việc sửa user: sửa xong mà nhật ký hỏng thì thao tác
 *    không xảy ra, thay vì "rào chắn đã tháo mà không ai biết".
 */
export type TwoFactorResetInput = {
  /** email tài khoản bị xoá 2FA */
  email: string
  /** email người thực hiện — không có trong hệ thống thì vẫn chạy nhưng audit ghi actorId=null */
  actorEmail: string
  reason: string
  apply: boolean
}

export type TwoFactorResetTarget = {
  id: number
  email: string
  name: string
  roleName: string
  twoFactorEnabled: boolean
  /** đã quét QR nhưng chưa xác nhận — bật bắt buộc lên vẫn bị chặn */
  hasPendingSecret: boolean
}

export type TwoFactorResetActor = { id: number; email: string; roleName: string } | null

export type TwoFactorResetResult =
  | { status: 'NOT_FOUND'; email: string }
  | {
      status: 'DRY_RUN' | 'APPLIED'
      target: TwoFactorResetTarget
      actor: TwoFactorResetActor
      actorEmail: string
      reason: string
      /** chỉ có khi `APPLIED` */
      revokedRefreshTokens?: number
    }

export async function resetTwoFactorForUser(
  prisma: PrismaClient,
  input: TwoFactorResetInput,
): Promise<TwoFactorResetResult> {
  const reason = input.reason?.trim()
  if (!reason) throw new Error('resetTwoFactorForUser: thiếu lý do (reason)')
  if (!input.actorEmail?.trim()) throw new Error('resetTwoFactorForUser: thiếu người thực hiện (actorEmail)')

  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      twoFactorEnabled: true,
      totpSecret: true,
      role: { select: { name: true } },
    },
  })
  if (!user) return { status: 'NOT_FOUND', email: input.email }

  const actor = await prisma.user.findFirst({
    where: { email: input.actorEmail, deletedAt: null },
    select: { id: true, email: true, role: { select: { name: true } } },
  })

  const target: TwoFactorResetTarget = {
    id: user.id,
    email: user.email,
    name: user.name,
    roleName: user.role.name,
    twoFactorEnabled: user.twoFactorEnabled,
    hasPendingSecret: Boolean(user.totpSecret),
  }
  const actorSummary: TwoFactorResetActor = actor
    ? { id: actor.id, email: actor.email, roleName: actor.role.name }
    : null

  const base = { target, actor: actorSummary, actorEmail: input.actorEmail, reason }
  if (!input.apply) return { status: 'DRY_RUN', ...base }

  const revokedRefreshTokens = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { totpSecret: null, twoFactorEnabled: false, twoFactorEnabledAt: null },
    })
    const revoked = await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        actorId: actorSummary?.id ?? null,
        actorRole: actorSummary?.roleName ?? null,
        action: 'TWO_FACTOR_RESET',
        entityType: 'USER',
        entityId: user.id,
        before: { twoFactorEnabled: target.twoFactorEnabled, hadPendingSecret: target.hasPendingSecret },
        after: { twoFactorEnabled: false, hadPendingSecret: false, revokedRefreshTokens: revoked.count },
        reason,
      },
    })
    return revoked.count
  })

  return { status: 'APPLIED', ...base, revokedRefreshTokens }
}
