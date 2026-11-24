import { Prisma } from '@prisma/client'

/**
 * Doanh thu cua 1 don.
 *
 * Lay theo `grandTotal` da boc tach (ADR 0001 D6) chu khong cong lai tu item:
 * khi co giam gia / phi phuc vu / thue thi tong item khac so tien thuc thu.
 */
export function orderRevenue(order: { grandTotal?: Prisma.Decimal.Value | null }): Prisma.Decimal {
  return new Prisma.Decimal(order.grandTotal ?? 0).toDecimalPlaces(2)
}

/**
 * Cong don doanh thu theo ngay.
 *
 * Luu y: KHONG duoc cong `number + Decimal` (decimal.js tra ve string khi bi ep kieu),
 * phep `0 + Decimal` se thanh noi chuoi "0120000". Luon cong trong Decimal.
 */
export function addRevenueByDate(
  map: Record<string, Prisma.Decimal>,
  date: string,
  amount: Prisma.Decimal,
): Record<string, Prisma.Decimal> {
  map[date] = new Prisma.Decimal(map[date] ?? 0)
    .add(new Prisma.Decimal(amount))
    .toDecimalPlaces(2)
  return map
}

/** Doi bang doanh thu theo ngay sang number truoc khi tra ra API */
export function revenueByDateToNumbers(map: Record<string, Prisma.Decimal>): Record<string, number> {
  return Object.fromEntries(Object.entries(map).map(([date, value]) => [date, new Prisma.Decimal(value).toNumber()]))
}
