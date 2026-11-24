/**
 * Vòng đời của `PaymentIntent` (ADR 0001 D7).
 *
 * Intent được chốt lúc tạo URL thanh toán. Chỉ intent còn `PENDING` và còn trong hạn
 * mới được phép tạo hiệu ứng. Lý do:
 * - Mỗi lần bấm "thanh toán" tạo 1 intent mới và VOID các intent cũ trùng đơn; nếu webhook
 *   của URL cũ vẫn chạy thì hoá đơn đã đổi vẫn bị thu/huỷ theo số tiền cũ.
 * - URL VNPay có hạn; quá hạn thì phải coi là không dùng được, kể cả khi khách bấm lại link cũ.
 */
export const PAYMENT_INTENT_TTL_MS = 30 * 60 * 1000

export type PaymentIntentLike = {
  status: string
  createdAt: Date | string
}

/**
 * Intent có được phép tạo hiệu ứng không.
 *
 * `null`/`undefined` (luồng cũ, chưa có intent) trả `true` để không chặn oan.
 */
export function isIntentUsable(
  intent: PaymentIntentLike | null | undefined,
  now: Date = new Date(),
  ttlMs: number = PAYMENT_INTENT_TTL_MS,
): boolean {
  if (!intent) return true
  if (intent.status !== 'PENDING') return false

  const createdAt = new Date(intent.createdAt).getTime()
  if (Number.isNaN(createdAt)) return false

  return now.getTime() - createdAt <= ttlMs
}
