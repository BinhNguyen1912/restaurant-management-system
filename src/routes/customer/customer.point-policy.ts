import { Prisma } from '@prisma/client'

/**
 * Chính sách điểm thưởng — TOÀN BỘ luật nằm ở đây, không rải trong service/repo.
 *
 * Vì sao điểm KHÔNG có bảng số dư: điểm là hàm của hai thứ đã có sẵn trong DB —
 * đơn đã thu tiền (`Order.status = PAID`) và voucher đã đổi bằng điểm (`Voucher.pointCost`).
 * Lưu thêm một cột `Customer.point` là mở đường cho hai con số lệch nhau: hoàn tiền một đơn mà
 * quên trừ điểm, hay sửa tay một chỗ. Tính lại thì không thể lệch, và đơn bị huỷ/hoàn tự mất điểm.
 *
 *   điểm tích luỹ = Σ floor(grandTotal của từng đơn PAID / 20.000)
 *   điểm đã dùng = Σ pointCost của voucher đã đổi
 *   số dư         = tích luỹ − đã dùng
 *
 * Làm tròn XUỐNG theo TỪNG ĐƠN (không phải trên tổng): đơn 39.000đ được 1 điểm, không phải 1.95;
 * đây cũng là cách khách tự kiểm được — "đơn 39k = 1 điểm" giải thích được ở quầy.
 */

/** Chi tiêu bao nhiêu đồng thì được 1 điểm. */
export const VND_PER_POINT = 20_000
/** 1 điểm đổi được bao nhiêu đồng. 20.000đ chi → 1 điểm → 1.000đ quà, tức hoàn ~5% doanh thu. */
export const POINT_VALUE_VND = 1_000
/** Đổi tối thiểu: dưới 10 điểm thì voucher chỉ vài nghìn, không ai dùng, chỉ sinh rác. */
export const MIN_REDEEM_POINTS = 10
/** Voucher đổi bằng điểm sống bao nhiêu ngày. */
export const POINT_VOUCHER_VALID_DAYS = 30

export type RedeemCheck = { ok: true; valueVnd: number } | { ok: false; message: string; params?: Record<string, number> }

/**
 * Điểm của MỘT đơn. Đơn chưa thu tiền/đơn 0 đồng = 0 điểm; `Decimal` được nhận trực tiếp để
 * không phải đổi sang float (sai số ở mốc 20.000đ là chuyện có thật).
 */
export function earnedPointsForOrder(grandTotal: Prisma.Decimal.Value): number {
  const amount = new Prisma.Decimal(grandTotal)
  if (amount.lessThanOrEqualTo(0)) return 0
  return amount.div(VND_PER_POINT).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN).toNumber()
}

/** Tổng điểm tích luỹ của nhiều đơn — cộng điểm TỪNG đơn, không làm tròn trên tổng. */
export function totalEarnedPoints(orderTotals: Prisma.Decimal.Value[]): number {
  return orderTotals.reduce<number>((sum, total) => sum + earnedPointsForOrder(total), 0)
}

/** Số dư = tích luỹ − đã dùng, không âm (đổi quá tay không bao giờ thành số dư âm). */
export function redeemableBalance(earned: number, spent: number): number {
  return Math.max(0, Math.trunc(earned) - Math.trunc(spent))
}

export function pointsToVnd(points: number): number {
  return Math.max(0, Math.trunc(points)) * POINT_VALUE_VND
}

/**
 * Kiểm một yêu cầu đổi điểm trước khi ghi gì vào DB.
 * Trả `valueVnd` để service tạo voucher — nơi duy nhất biết tỉ giá.
 */
export function checkRedeemable({ balance, points }: { balance: number; points: number }): RedeemCheck {
  if (!Number.isInteger(points) || points <= 0) {
    return { ok: false, message: 'Error.InvalidPoints' }
  }
  if (points < MIN_REDEEM_POINTS) {
    return { ok: false, message: 'Error.MinRedeemPoints', params: { min: MIN_REDEEM_POINTS } }
  }
  if (points > balance) {
    return { ok: false, message: 'Error.NotEnoughPoints', params: { balance, points } }
  }
  return { ok: true, valueVnd: pointsToVnd(points) }
}

/** Hạn dùng voucher đổi bằng điểm, tính từ lúc đổi. */
export function pointVoucherEndAt(from: Date): Date {
  const end = new Date(from.getTime())
  end.setUTCDate(end.getUTCDate() + POINT_VOUCHER_VALID_DAYS)
  return end
}
