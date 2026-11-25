import { Prisma } from '@prisma/client'
import { computeOrderCogs, convertQuantity } from '@/shared/service/cogs'

/**
 * Ticket #11 yêu cầu đúng kịch bản: "1 đơn 2 món có recipe khác nhau → COGS đúng tổng định lượng × đơn giá".
 */
const conversions = [
  { fromUnitId: 'kg', toUnitId: 'g', factor: 1000 },
  { fromUnitId: 'lít', toUnitId: 'ml', factor: 1000 },
]

describe('computeOrderCogs', () => {
  it('2 món, recipe khác nhau -> cộng đúng định lượng × đơn giá', () => {
    const result = computeOrderCogs({
      items: [
        { skuId: 1, quantity: 2 }, // 2 phần Phở
        { skuId: 2, quantity: 1 }, // 1 phần Trà đá
      ],
      recipes: [
        { skuId: 1, ingredientId: 10, quantity: 0.2, unitId: 'kg' }, // 200g bò / phần
        { skuId: 1, ingredientId: 11, quantity: 0.1, unitId: 'kg' }, // 100g bánh phở / phần
        { skuId: 2, ingredientId: 12, quantity: 0.05, unitId: 'kg' }, // 50g trà / phần
      ],
      ingredients: [
        { id: 10, name: 'Bò', unitCost: 300000, unitId: 'kg' },
        { id: 11, name: 'Bánh phở', unitCost: 40000, unitId: 'kg' },
        { id: 12, name: 'Trà', unitCost: 200000, unitId: 'kg' },
      ],
    })

    // 2×(0.2×300.000 + 0.1×40.000) + 1×(0.05×200.000) = 2×64.000 + 10.000 = 138.000
    expect(result.total.toNumber()).toBe(138000)
    expect(result.lines.find((line) => line.ingredientId === 10)!.quantity.toNumber()).toBe(0.4)
    expect(result.total.toNumber()).toBe(Number.isInteger(result.total.toNumber()) ? result.total.toNumber() : -1)
    expect(result.missingCost).toHaveLength(0)
  })

  it('quy đổi đơn vị: recipe 200g, nguyên liệu tính theo kg', () => {
    const result = computeOrderCogs({
      items: [{ skuId: 1, quantity: 1 }],
      recipes: [{ skuId: 1, ingredientId: 10, quantity: 200, unitId: 'g' }],
      ingredients: [{ id: 10, name: 'Bò', unitCost: 300000, unitId: 'kg' }],
      conversions,
    })
    // 200g = 0,2kg × 300.000 = 60.000
    expect(result.total.toNumber()).toBe(60000)
    expect(result.unconvertedUnits).toHaveLength(0)
  })

  it('quy đổi ngược: recipe dùng kg, nguyên liệu tính theo g', () => {
    const result = computeOrderCogs({
      items: [{ skuId: 1, quantity: 2 }],
      recipes: [{ skuId: 1, ingredientId: 20, quantity: 0.1, unitId: 'kg' }],
      ingredients: [{ id: 20, name: 'Đường', unitCost: 25, unitId: 'g' }],
      conversions,
    })
    // 2 × 0,1kg = 0,2kg = 200g × 25 = 5.000
    expect(result.total.toNumber()).toBe(5000)
  })

  it('không có conversion -> tính 1:1 và BÁO RA (không im lặng)', () => {
    const result = computeOrderCogs({
      items: [{ skuId: 1, quantity: 1 }],
      recipes: [{ skuId: 1, ingredientId: 30, quantity: 2, unitId: 'muỗng' }],
      ingredients: [{ id: 30, name: 'Muối', unitCost: 1000, unitId: 'g' }],
    })
    expect(result.total.toNumber()).toBe(2000)
    expect(result.unconvertedUnits).toEqual([{ ingredientId: 30, from: 'muỗng', to: 'g' }])
  })

  it('nguyên liệu chưa khai giá -> bỏ khỏi COGS và ghi vào missingCost', () => {
    const result = computeOrderCogs({
      items: [{ skuId: 1, quantity: 1 }],
      recipes: [
        { skuId: 1, ingredientId: 10, quantity: 1, unitId: 'kg' },
        { skuId: 1, ingredientId: 11, quantity: 1, unitId: 'kg' },
      ],
      ingredients: [
        { id: 10, name: 'Bò', unitCost: 300000, unitId: 'kg' },
        { id: 11, name: 'Gia vị', unitCost: 0, unitId: 'kg' },
      ],
    })
    expect(result.total.toNumber()).toBe(300000)
    expect(result.missingCost).toEqual([{ ingredientId: 11, name: 'Gia vị' }])
  })

  it('món không có recipe / số lượng 0 / nguyên liệu đã xoá -> 0, không lỗi', () => {
    expect(
      computeOrderCogs({ items: [{ skuId: 1, quantity: 1 }], recipes: [], ingredients: [] }).total.toNumber(),
    ).toBe(0)
    expect(
      computeOrderCogs({
        items: [{ skuId: 1, quantity: 0 }],
        recipes: [{ skuId: 1, ingredientId: 10, quantity: 1, unitId: 'kg' }],
        ingredients: [{ id: 10, name: 'Bò', unitCost: 300000, unitId: 'kg' }],
      }).total.toNumber(),
    ).toBe(0)
    expect(
      computeOrderCogs({
        items: [{ skuId: 1, quantity: 1 }],
        recipes: [{ skuId: 1, ingredientId: 99, quantity: 1, unitId: 'kg' }],
        ingredients: [{ id: 10, name: 'Bò', unitCost: 300000, unitId: 'kg' }],
      }).total.toNumber(),
    ).toBe(0)
  })

  it('tổng là số đồng nguyên và không âm (VND)', () => {
    const result = computeOrderCogs({
      items: [{ skuId: 1, quantity: 3 }],
      recipes: [{ skuId: 1, ingredientId: 10, quantity: 0.333, unitId: 'kg' }],
      ingredients: [{ id: 10, name: 'Bò', unitCost: 299999, unitId: 'kg' }],
    })
    expect(Number.isInteger(result.total.toNumber())).toBe(true)
    expect(result.total.greaterThanOrEqualTo(new Prisma.Decimal(0))).toBe(true)
  })
})

describe('convertQuantity', () => {
  it('cùng đơn vị -> giữ nguyên', () => {
    expect(convertQuantity(new Prisma.Decimal(5), 'kg', 'kg', conversions)).toEqual({
      quantity: new Prisma.Decimal(5),
      converted: true,
    })
  })

  it('factor 0 hoặc không tìm thấy -> 1:1 và converted=false', () => {
    const result = convertQuantity(new Prisma.Decimal(2), 'x', 'y', [{ fromUnitId: 'x', toUnitId: 'y', factor: 0 }])
    expect(result.converted).toBe(false)
    expect(result.quantity.toNumber()).toBe(2)
  })
})
