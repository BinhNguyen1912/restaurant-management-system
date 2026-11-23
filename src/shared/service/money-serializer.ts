import { Decimal } from '@prisma/client/runtime/library'

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const walk = (value: unknown): unknown => {
  if (value instanceof Decimal) return Number(value)
  if (Array.isArray(value)) return value.map(walk)
  // Date, Buffer, Map... giu nguyen
  if (!isPlainObject(value)) return value

  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    result[key] = walk(child)
  }
  return result
}

/**
 * Doi moi cot tien kieu `Decimal` thanh `number` truoc khi tra ra API.
 *
 * Prisma giu so tien o dang Decimal (chinh xac khi tinh toan). Ra den FE thi phai la
 * number, neu khong JSON se bien Decimal thanh chuoi ("120000.00") va FE khong cong tru duoc.
 *
 * Chi doi gia tri Decimal; Date, string, boolean giu nguyen.
 */
export function toMoneyNumbers<T>(value: unknown): T {
  return walk(value) as T
}
