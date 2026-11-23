import { Prisma } from '@prisma/client'
import { addRevenueByDate, orderRevenue, revenueByDateToNumbers } from './dashboard-money'

/**
 * Regression bug (review 2026-11-23): doanh thu theo nguoi duoc cong bang
 * `number + Decimal` nen ra chuoi "012000060000" va endpoint tra 500 (zod doi number).
 */
describe('dashboard money', () => {
  it('cong don Decimal khong bi noi chuoi', () => {
    let map: Record<string, Prisma.Decimal> = {}
    map = addRevenueByDate(map, '23/11/2026', new Prisma.Decimal(120000))
    map = addRevenueByDate(map, '23/11/2026', new Prisma.Decimal(60000))
    map = addRevenueByDate(map, '24/11/2026', new Prisma.Decimal('50000.50'))

    expect(map['23/11/2026'].toString()).toBe('180000')
    expect(map['24/11/2026'].toString()).toBe('50000.5')
  })

  it('doi sang number khi tra ra API (zod doi number, khong phai string)', () => {
    const numbers = revenueByDateToNumbers({ '23/11/2026': new Prisma.Decimal(180000) })

    expect(typeof numbers['23/11/2026']).toBe('number')
    expect(numbers['23/11/2026']).toBe(180000)
  })

  it('doanh thu 1 don lay theo grandTotal, khong cong lai tu item', () => {
    // item cong lai = 100.000 nhung da giam gia 20.000 => thuc thu 80.000
    expect(orderRevenue({ grandTotal: new Prisma.Decimal(80000) }).toString()).toBe('80000')
  })

  it('don cu chua co grandTotal thi tra 0, khong NaN', () => {
    expect(orderRevenue({ grandTotal: null }).toString()).toBe('0')
    expect(orderRevenue({}).toString()).toBe('0')
  })
})
