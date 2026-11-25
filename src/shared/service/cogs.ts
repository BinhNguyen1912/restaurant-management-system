import { Prisma } from '@prisma/client'

/**
 * COGS — giá vốn hàng bán (ticket #11).
 *
 * Nguyên tắc đã chốt:
 *  - Giá vốn = **định lượng trong recipe × giá nhập của nguyên liệu**, KHÔNG lấy từ tồn kho.
 *    Tồn kho hiện do Redis Lua trừ và có bug "trừ một phần không rollback" → không thể là nguồn sự thật.
 *  - Nguyên liệu chưa khai `unitCost` thì phần đó = 0 (không đoán giá), và trả về danh sách thiếu giá
 *    để người vận hành biết báo cáo lãi gộp đang thấp hơn thực tế ở đâu.
 */

export type CogsRecipeRow = {
  skuId: number
  ingredientId: number
  /** định lượng trong recipe, đơn vị = `unitId` của dòng recipe */
  quantity: Prisma.Decimal.Value
  unitId: string
}

export type CogsIngredientCost = {
  id: number
  name: string
  /** giá nhập cho 1 đơn vị `unitId` của nguyên liệu */
  unitCost: Prisma.Decimal.Value
  unitId: string
}

export type CogsUnitConversion = {
  fromUnitId: string
  toUnitId: string
  factor: Prisma.Decimal.Value
}

export type CogsSoldItem = {
  skuId: number
  quantity: number
}

export type CogsResult = {
  total: Prisma.Decimal
  /** chi tiết từng nguyên liệu — để đối chiếu khi ai đó hỏi "số này ở đâu ra" */
  lines: { ingredientId: number; name: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal; amount: Prisma.Decimal }[]
  /** nguyên liệu chưa khai giá nhập (COGS bị thiếu ở các dòng này) */
  missingCost: { ingredientId: number; name: string }[]
  /** đơn vị không quy đổi được (đang coi 1:1 — nói ra thay vì im lặng) */
  unconvertedUnits: { ingredientId: number; from: string; to: string }[]
}

const ZERO = new Prisma.Decimal(0)

/**
 * Quy đổi định lượng recipe sang đơn vị của nguyên liệu.
 * Cùng đơn vị -> giữ nguyên. Có conversion trực tiếp -> nhân factor. Có conversion ngược -> chia.
 * Không tìm được -> 1:1 và báo vào `unconvertedUnits` (không âm thầm bỏ dòng).
 */
export function convertQuantity(
  quantity: Prisma.Decimal,
  fromUnit: string,
  toUnit: string,
  conversions: CogsUnitConversion[],
): { quantity: Prisma.Decimal; converted: boolean } {
  if (fromUnit === toUnit) return { quantity, converted: true }

  const direct = conversions.find((row) => row.fromUnitId === fromUnit && row.toUnitId === toUnit)
  if (direct) {
    const factor = new Prisma.Decimal(direct.factor)
    if (factor.greaterThan(0)) return { quantity: quantity.mul(factor), converted: true }
  }

  const reverse = conversions.find((row) => row.fromUnitId === toUnit && row.toUnitId === fromUnit)
  if (reverse) {
    const factor = new Prisma.Decimal(reverse.factor)
    if (factor.greaterThan(0)) return { quantity: quantity.div(factor), converted: true }
  }

  return { quantity, converted: false }
}

/**
 * Tính COGS cho danh sách món đã bán. Hàm THUẦN — test được đúng kịch bản ticket yêu cầu:
 * "1 đơn 2 món có recipe khác nhau → COGS = tổng định lượng × đơn giá".
 */
export function computeOrderCogs(input: {
  items: CogsSoldItem[]
  recipes: CogsRecipeRow[]
  ingredients: CogsIngredientCost[]
  conversions?: CogsUnitConversion[]
}): CogsResult {
  const conversions = input.conversions ?? []
  const ingredientById = new Map(input.ingredients.map((ingredient) => [ingredient.id, ingredient]))
  const recipesBySku = new Map<number, CogsRecipeRow[]>()
  for (const row of input.recipes) {
    const list = recipesBySku.get(row.skuId) ?? []
    list.push(row)
    recipesBySku.set(row.skuId, list)
  }

  const lines = new Map<number, { ingredientId: number; name: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal; amount: Prisma.Decimal }>()
  const missingCost: { ingredientId: number; name: string }[] = []
  const unconvertedUnits: { ingredientId: number; from: string; to: string }[] = []

  for (const item of input.items) {
    const recipe = recipesBySku.get(item.skuId) ?? []
    const sold = new Prisma.Decimal(item.quantity)
    if (sold.lessThanOrEqualTo(0)) continue

    for (const row of recipe) {
      const ingredient = ingredientById.get(row.ingredientId)
      // nguyên liệu đã xoá/không còn trong danh mục -> bỏ qua, không bịa giá
      if (!ingredient) continue

      const base = new Prisma.Decimal(row.quantity).mul(sold)
      const { quantity, converted } = convertQuantity(base, row.unitId, ingredient.unitId, conversions)
      const unitCost = new Prisma.Decimal(ingredient.unitCost)

      if (!converted) {
        unconvertedUnits.push({ ingredientId: ingredient.id, from: row.unitId, to: ingredient.unitId })
      }
      if (unitCost.lessThanOrEqualTo(0)) {
        if (!missingCost.some((entry) => entry.ingredientId === ingredient.id)) {
          missingCost.push({ ingredientId: ingredient.id, name: ingredient.name })
        }
        continue
      }

      const amount = quantity.mul(unitCost)
      const current = lines.get(ingredient.id) ?? {
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity: ZERO,
        unitCost,
        amount: ZERO,
      }
      current.quantity = current.quantity.add(quantity)
      current.amount = current.amount.add(amount)
      lines.set(ingredient.id, current)
    }
  }

  const total = [...lines.values()].reduce((sum, line) => sum.add(line.amount), ZERO).toDecimalPlaces(0)
  return { total, lines: [...lines.values()], missingCost, unconvertedUnits }
}
