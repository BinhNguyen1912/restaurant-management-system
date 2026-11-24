import { Prisma } from '@prisma/client'

/**
 * Tinh két cuoi ca (ticket P2-1, ADR 0001 D7).
 *
 *   expectedCash = openingFloat + Σ thu tien mat trong ca + Σ thu tay (IN) - Σ chi (OUT)
 *   variance     = countedCash - expectedCash      (> 0 thua, < 0 thieu)
 *
 * Tach thanh ham thuan de test duoc khong can DB, va de ca dong ca lan hien thi
 * "so két hien tai" dung cung mot cong thuc.
 */
export type CashShiftTotalsInput = {
  /** Tien le co san trong két khi mo ca */
  openingFloat: Prisma.Decimal.Value
  /** Σ Payment CASH da PAID trong ca */
  cashIn: Prisma.Decimal.Value
  /** Tong cac khoan thu tay (CashMovement IN) */
  cashInMovements?: Prisma.Decimal.Value
  /** Tong cac khoan chi (CashMovement OUT) */
  cashOut: Prisma.Decimal.Value
}

export type CashShiftTotals = {
  openingFloat: Prisma.Decimal
  cashIn: Prisma.Decimal
  cashInMovements: Prisma.Decimal
  cashOut: Prisma.Decimal
  expectedCash: Prisma.Decimal
}

const zero = () => new Prisma.Decimal(0)

const money = (value: Prisma.Decimal.Value | undefined | null): Prisma.Decimal =>
  value === undefined || value === null ? zero() : new Prisma.Decimal(value).toDecimalPlaces(2)

export function cashShiftTotals(input: CashShiftTotalsInput): CashShiftTotals {
  const openingFloat = money(input.openingFloat)
  const cashIn = money(input.cashIn)
  const cashInMovements = money(input.cashInMovements)
  const cashOut = money(input.cashOut)

  return {
    openingFloat,
    cashIn,
    cashInMovements,
    cashOut,
    expectedCash: openingFloat.plus(cashIn).plus(cashInMovements).minus(cashOut).toDecimalPlaces(2),
  }
}

/** countedCash - expectedCash */
export function cashVariance(expectedCash: Prisma.Decimal.Value, countedCash: Prisma.Decimal.Value): Prisma.Decimal {
  return money(countedCash).minus(money(expectedCash)).toDecimalPlaces(2)
}

export type CashVarianceLine = { accountCode: string; direction: 'DEBIT' | 'CREDIT'; amount: Prisma.Decimal }

/**
 * But toan cho phan lech két — chi 2 dong, Nợ = Có:
 *  - thieu: Nợ CASH_SHORTAGE (chi phi) / Có CASH (tien mat giam)
 *  - thua : Nợ CASH / Có CASH_OVERAGE (thu nhap khac)
 *  - khop : khong co but toan
 */
export function cashVarianceLines(variance: Prisma.Decimal.Value): CashVarianceLine[] {
  const amount = money(variance)
  if (amount.isZero()) return []

  const abs = amount.abs()
  return amount.isNegative()
    ? [
        { accountCode: 'CASH_SHORTAGE', direction: 'DEBIT', amount: abs },
        { accountCode: 'CASH', direction: 'CREDIT', amount: abs },
      ]
    : [
        { accountCode: 'CASH', direction: 'DEBIT', amount: abs },
        { accountCode: 'CASH_OVERAGE', direction: 'CREDIT', amount: abs },
      ]
}
