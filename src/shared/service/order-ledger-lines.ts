import { Prisma } from '@prisma/client'

/** Tiền của 1 đơn đã bóc tách (ADR 0001 D6). tip luôn 0 — khoan làm. */
export type OrderMoneyParts = {
  grandTotal: Prisma.Decimal.Value
  subtotal: Prisma.Decimal.Value
  discountTotal: Prisma.Decimal.Value
  serviceChargeAmount: Prisma.Decimal.Value
  taxTotal: Prisma.Decimal.Value
  tipAmount?: Prisma.Decimal.Value
  /**
   * Doanh thu thuần (đã trừ VAT) khi giá menu ĐÃ gồm thuế — `computeOrderMoney` trả về.
   * Không truyền thì suy ra: grandTotal − phí − thuế (đúng cho cả 2 kiểu giá).
   */
  revenue?: Prisma.Decimal.Value
}

export type LedgerLineSpec = {
  accountCode: string
  direction: 'DEBIT' | 'CREDIT'
  amount: Prisma.Decimal
}

export type PaymentAccount = 'CASH' | 'VNPAY_CLEARING'

const ZERO = new Prisma.Decimal(0)

/**
 * Sổ cái chỉ nhận số nguyên đồng (CK_LedgerLine_amount: amount > 0 AND amount = round(amount)).
 * VND không có đơn vị lẻ nên làm tròn về đồng ở đây, phần chênh đi vào ROUNDING_ADJUSTMENT.
 */
const d = (value: Prisma.Decimal.Value | undefined | null): Prisma.Decimal =>
  value === undefined || value === null ? new Prisma.Decimal(0) : new Prisma.Decimal(value).toDecimalPlaces(0)

/**
 * Sinh các dòng bút toán cho 1 đơn đã thu tiền.
 *
 * Quy tắc (ADR 0001 D6):
 * - Nợ tiền (CASH / VNPAY_CLEARING) = `grandTotal` trừ phần cọc đã dùng — đúng số tiền khách trả tại quầy
 * - Nợ `DEPOSIT_LIABILITY` = phần cọc đã nhận trước đó, nay mới thành doanh thu
 * - Có doanh thu món = subtotal − discount
 * - Có phí phục vụ, thuế (nếu > 0)
 * - Phần chênh còn lại (dữ liệu cũ backfill, làm tròn) ghi vào `ROUNDING_ADJUSTMENT`
 *   để bút toán LUÔN cân — thà lộ ra 1 dòng chênh còn hơn ghi sổ lệch.
 * - Tip không ghi sổ (khoan làm).
 *
 * Hàm này cam kết: Σ Nợ = Σ Có = `grandTotal`, cọc chỉ đổi chỗ ghi nợ chứ không đổi tổng.
 */
export function buildOrderLedgerLines(
  parts: OrderMoneyParts,
  paidInto: PaymentAccount,
  options?: { depositSettled?: Prisma.Decimal.Value },
): LedgerLineSpec[] {
  const grandTotal = d(parts.grandTotal)
  if (grandTotal.lessThanOrEqualTo(0)) return []

  const depositSettled = d(options?.depositSettled)
  // Cọc đã nhận trước đó là nợ với khách: chỉ phần còn lại mới là tiền thu tại quầy.
  const settled = depositSettled.greaterThan(0) ? Prisma.Decimal.min(depositSettled, grandTotal) : ZERO
  const cashCollected = grandTotal.minus(settled)

  const lines: LedgerLineSpec[] = []
  if (cashCollected.greaterThan(0)) lines.push({ accountCode: paidInto, direction: 'DEBIT', amount: cashCollected })
  if (settled.greaterThan(0)) lines.push({ accountCode: 'DEPOSIT_LIABILITY', direction: 'DEBIT', amount: settled })

  const service = d(parts.serviceChargeAmount)
  const tax = d(parts.taxTotal)
  const tip = d(parts.tipAmount)

  // Doanh thu KHÔNG gồm VAT: caller truyền `revenue` (computeOrderMoney đã trừ thuế khi giá
  // menu đã gồm VAT). Không truyền thì suy ra subtotal − discount như cũ, phần lệch còn lại đi
  // vào ROUNDING_ADJUSTMENT để bút toán luôn cân.
  const revenue =
    parts.revenue !== undefined && parts.revenue !== null
      ? d(parts.revenue)
      : d(parts.subtotal).minus(d(parts.discountTotal))
  if (revenue.greaterThan(0)) lines.push({ accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount: revenue })

  if (service.greaterThan(0)) lines.push({ accountCode: 'SERVICE_CHARGE', direction: 'CREDIT', amount: service })

  if (tax.greaterThan(0)) lines.push({ accountCode: 'TAX_PAYABLE', direction: 'CREDIT', amount: tax })

  const credited = lines
    .filter((line) => line.direction === 'CREDIT')
    .reduce((total, line) => total.add(line.amount), ZERO)

  const difference = grandTotal.minus(credited)
  if (difference.greaterThan(0)) {
    lines.push({ accountCode: 'ROUNDING_ADJUSTMENT', direction: 'CREDIT', amount: difference.toDecimalPlaces(0) })
  } else if (difference.lessThan(0)) {
    lines.push({ accountCode: 'ROUNDING_ADJUSTMENT', direction: 'DEBIT', amount: difference.abs().toDecimalPlaces(0) })
  }

  return lines
}
