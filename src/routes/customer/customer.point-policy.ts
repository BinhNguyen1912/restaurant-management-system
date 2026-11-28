import { Prisma } from '@prisma/client'

/**
 * Chính sách điểm thưởng — TOÀN BỘ luật nằm ở đây, không rải trong service/repo.
 *
 * Vì sao điểm KHÔNG có bảng số dư: điểm là hàm của hai thứ đã có sẵn trong DB —
 * đơn đã thu tiền (`Order.status = PAID`) và các lần đổi điểm (`PointRedemption`).
 * Lưu thêm một cột `Customer.point` là mở đường cho hai con số lệch nhau: hoàn tiền một đơn mà
 * quên trừ điểm, hay sửa tay một chỗ. Tính lại thì không thể lệch, và đơn bị huỷ/hoàn tự mất điểm.
 *
 *   điểm tích luỹ = Σ floor(grandTotal của từng đơn PAID / 20.000)
 *   điểm đã dùng  = Σ PointRedemption.points (chưa bị void — đơn huỷ thì trả điểm lại)
 *   số dư         = tích luỹ − đã dùng
 *
 * Làm tròn XUỐNG theo TỪNG ĐƠN (không phải trên tổng): đơn 39.000đ được 1 điểm, không phải 1.95;
 * đây cũng là cách khách tự kiểm được — "đơn 39k = 1 điểm" giải thích được ở quầy.
 */

/** Chi tiêu bao nhiêu đồng thì được 1 điểm. */
export const VND_PER_POINT = 20_000
/** 1 điểm đổi được bao nhiêu đồng. 20.000đ chi → 1 điểm → 1.000đ quà, tức hoàn ~5% doanh thu. */
export const POINT_VALUE_VND = 1_000
/** Đổi tối thiểu: dưới 10 điểm thì chỉ giảm được vài nghìn, không đáng một lần bấm. */
export const MIN_REDEEM_POINTS = 10

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
 * Trần điểm đổi được cho một hoá đơn: không đổi quá số tiền còn phải trả, nếu không phần dư bốc
 * hơi mà khách vẫn mất điểm. `payable` = subtotal − discountTotal của đơn.
 *
 * Dùng chung cho cả hai phía: service chặn khi vượt trần, và API danh sách đơn trả về con số này
 * để client không cho chọn sai — hai chỗ cùng một công thức nên không thể lệch nhau.
 */
export function maxRedeemablePoints(payable: Prisma.Decimal.Value): number {
  const amount = new Prisma.Decimal(payable)
  if (amount.lessThanOrEqualTo(0)) return 0
  return amount.div(POINT_VALUE_VND).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN).toNumber()
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
