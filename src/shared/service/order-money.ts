import { Prisma } from '@prisma/client'

export type OrderMoneyLine = {
  price: Prisma.Decimal.Value
  quantity: number
}

export type OrderMoneyInput = {
  lines: OrderMoneyLine[]
  discountTotal?: Prisma.Decimal.Value
  /** don vi %, vd 5 = 5% */
  serviceChargeRate?: Prisma.Decimal.Value
  taxTotal?: Prisma.Decimal.Value
  /** tip khoan lam: luon truyen 0 */
  tipAmount?: Prisma.Decimal.Value
}

export type OrderMoney = {
  subtotal: Prisma.Decimal
  discountTotal: Prisma.Decimal
  serviceChargeRate: Prisma.Decimal
  serviceChargeAmount: Prisma.Decimal
  taxTotal: Prisma.Decimal
  tipAmount: Prisma.Decimal
  grandTotal: Prisma.Decimal
}

const ZERO = new Prisma.Decimal(0)
const TWO_PLACES = 2

const toDecimal = (value?: Prisma.Decimal.Value | null): Prisma.Decimal =>
  value === undefined || value === null ? new Prisma.Decimal(0) : new Prisma.Decimal(value)

/**
 * Tinh tien cho 1 don (ADR 0001 D5/D6).
 *
 * Quy tac:
 * - subtotal = Σ (giá dòng × số lượng)
 * - phí phục vụ tính trên phần sau giảm giá: (subtotal - discount) × rate%
 * - thuế và tip cộng thẳng vào tổng, không chịu phí phục vụ
 * - giảm giá không được đẩy tổng xuống âm
 * - mọi phép tính bằng Decimal, làm tròn 2 chữ số
 */
export function computeOrderMoney(input: OrderMoneyInput): OrderMoney {
  const subtotal = input.lines
    .reduce((total, line) => total.add(toDecimal(line.price).mul(line.quantity)), ZERO)
    .toDecimalPlaces(TWO_PLACES)

  const discountRaw = toDecimal(input.discountTotal).toDecimalPlaces(TWO_PLACES)
  const discountTotal = Prisma.Decimal.min(discountRaw, subtotal)

  const serviceChargeRate = toDecimal(input.serviceChargeRate)
  const taxableBase = subtotal.minus(discountTotal)
  const serviceChargeAmount = taxableBase
    .mul(serviceChargeRate)
    .div(100)
    .toDecimalPlaces(TWO_PLACES)

  const taxTotal = toDecimal(input.taxTotal).toDecimalPlaces(TWO_PLACES)
  const tipAmount = toDecimal(input.tipAmount).toDecimalPlaces(TWO_PLACES)

  const grandTotal = taxableBase
    .add(serviceChargeAmount)
    .add(taxTotal)
    .add(tipAmount)
    .toDecimalPlaces(TWO_PLACES)

  return {
    subtotal,
    discountTotal,
    serviceChargeRate,
    serviceChargeAmount,
    taxTotal,
    tipAmount,
    grandTotal,
  }
}
