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
  /**
   * VAT (%) cua chi nhanh. Bo qua neu `pricesIncludeTax = true` (khi do VAT duoc
   * TRICH RA tu gia menu chu khong cong them).
   */
  taxRate?: Prisma.Decimal.Value
  /** Gia tren menu DA gom VAT chua (VN: thuong la da gom) */
  pricesIncludeTax?: boolean
  /** So tien thue co dinh (uu tien hon taxRate) — giu tuong thich voi code cu */
  taxTotal?: Prisma.Decimal.Value
  /** tip khoan lam: luon truyen 0 */
  tipAmount?: Prisma.Decimal.Value
}

export type OrderMoney = {
  subtotal: Prisma.Decimal
  discountTotal: Prisma.Decimal
  serviceChargeRate: Prisma.Decimal
  serviceChargeAmount: Prisma.Decimal
  /** VAT (%) da ap — luu vao don de doi cau hinh khong lam sai don cu */
  taxRate: Prisma.Decimal
  taxTotal: Prisma.Decimal
  tipAmount: Prisma.Decimal
  /** Tien hang thuan (chua VAT, chua phi) — doanh thu ghi Co REVENUE_FOOD */
  revenue: Prisma.Decimal
  grandTotal: Prisma.Decimal
}

const ZERO = new Prisma.Decimal(0)
const TWO_PLACES = 2
/**
 * VND không có đơn vị lẻ: sổ cái CHỈ nhận số nguyên đồng (ràng buộc CK_LedgerLine_amount).
 * Nên thuế / phí / tổng phải làm tròn về đồng ngay khi tính đơn.
 */
const VND = 0

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
    .toDecimalPlaces(VND)

  const tipAmount = toDecimal(input.tipAmount).toDecimalPlaces(TWO_PLACES)
  const billBeforeTax = taxableBase.add(serviceChargeAmount)

  // VAT co 2 kieu (chot voi chu du an):
  //  1) Gia menu DA gom VAT  -> trich thue ra tu hoa don, tong khong doi
  //  2) Gia menu CHUA gom VAT -> cong thue len tren
  const taxRate = toDecimal(input.taxRate)
  const explicitTax = input.taxTotal === undefined || input.taxTotal === null ? null : toDecimal(input.taxTotal)

  let taxTotal: Prisma.Decimal
  let grandTotal: Prisma.Decimal
  let revenue: Prisma.Decimal

  if (explicitTax !== null) {
    // Tuong thich code cu: so thue cho san
    taxTotal = explicitTax.toDecimalPlaces(VND)
    grandTotal = billBeforeTax.add(taxTotal).add(tipAmount).toDecimalPlaces(VND)
    revenue = taxableBase.toDecimalPlaces(VND)
  } else if (input.pricesIncludeTax !== false && taxRate.greaterThan(0)) {
    // Gia da gom VAT: thue TRICH RA tu hoa don = tong / (1 + rate) * rate
    grandTotal = billBeforeTax.add(tipAmount).toDecimalPlaces(VND)
    const divisor = new Prisma.Decimal(100).add(taxRate)
    taxTotal = billBeforeTax.mul(taxRate).div(divisor).toDecimalPlaces(VND)
    // Doanh thu = tien hang thuan - thue (dong nguyen, khop but toan)
    revenue = taxableBase.minus(taxTotal).toDecimalPlaces(VND)
  } else {
    // Gia chua gom VAT: cong thue len tren
    taxTotal = billBeforeTax.mul(taxRate).div(100).toDecimalPlaces(VND)
    grandTotal = billBeforeTax.add(taxTotal).add(tipAmount).toDecimalPlaces(VND)
    revenue = taxableBase.toDecimalPlaces(VND)
  }

  return {
    subtotal,
    discountTotal,
    serviceChargeRate,
    serviceChargeAmount,
    taxRate,
    taxTotal,
    tipAmount,
    revenue,
    grandTotal,
  }
}
