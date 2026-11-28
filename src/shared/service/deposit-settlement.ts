import { Prisma } from '@prisma/client'

/**
 * Tất toán tiền cọc khi khách trả nốt (ticket #07, phần còn lại).
 *
 * Cọc đã nhận trước đó không phải doanh thu — nó là NỢ với khách (`DEPOSIT_LIABILITY`).
 * Khi khách trả phần còn lại, tiền cọc mới được chuyển thành doanh thu:
 *
 *   Nợ DEPOSIT_LIABILITY  (số cọc được dùng)
 *   Có REVENUE_FOOD       (cùng số tiền)
 *
 * Không có bút toán này thì `DEPOSIT_LIABILITY` phình mãi và doanh thu thiếu đúng phần cọc.
 */

/**
 * Số cọc được tất toán = min(số cọc đã nhận, tiền của hoá đơn).
 * Hoá đơn nhỏ hơn cọc thì chỉ tất toán phần dùng được; phần dư vẫn là nợ phải trả khách.
 */
export function computeDepositSettlementAmount(
  depositAmount: Prisma.Decimal.Value | number | null | undefined,
  grandTotal: Prisma.Decimal.Value | number,
): Prisma.Decimal {
  const deposit = new Prisma.Decimal(depositAmount ?? 0)
  const total = new Prisma.Decimal(grandTotal)
  if (deposit.lessThanOrEqualTo(0) || total.lessThanOrEqualTo(0)) return new Prisma.Decimal(0)
  return Prisma.Decimal.min(deposit, total).toDecimalPlaces(0)
}

/**
 * Số tiền khách còn phải trả tại quầy = tiền hoá đơn trừ phần cọc đã dùng được.
 *
 * Dùng để đối chiếu với Payment.amount của lần thu tiền thứ hai. Trả 0 khi cọc đã phủ hết hoá đơn.
 */
export function computeOutstandingAmount(
  grandTotal: Prisma.Decimal.Value | number,
  depositAmount: Prisma.Decimal.Value | number | null | undefined,
): Prisma.Decimal {
  const total = new Prisma.Decimal(grandTotal).toDecimalPlaces(0)
  if (total.lessThanOrEqualTo(0)) return new Prisma.Decimal(0)
  return Prisma.Decimal.max(total.minus(computeDepositSettlementAmount(depositAmount, total)), new Prisma.Decimal(0)).toDecimalPlaces(0)
}
