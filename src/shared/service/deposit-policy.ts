import { Prisma } from '@prisma/client'

/** Các mức cọc được phép, tính theo % giá trị món đặt trước. */
export const DEPOSIT_PERCENTS = [30, 50, 70, 100] as const

export function isAllowedDepositPercent(value: number | null | undefined): boolean {
  return typeof value === 'number' && (DEPOSIT_PERCENTS as readonly number[]).includes(value)
}

/**
 * Tiền cọc = giá trị món đặt trước x %cọc, làm tròn về đồng (VND không có phần lẻ).
 *
 * Server luôn tự tính và client không gửi số tiền cọc, nếu không Payment.amount và số VNPay thu
 * có thể lệch nhau, và bút toán quyết toán cọc lấy sai số.
 */
export function computeDepositAmount(preOrderTotal: number, depositPercent: number): number {
  if (!isAllowedDepositPercent(depositPercent)) {
    throw new Error(`Deposit percent must be 30, 50, 70, or 100, got ${depositPercent}`)
  }
  return new Prisma.Decimal(preOrderTotal)
    .mul(depositPercent)
    .div(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber()
}
