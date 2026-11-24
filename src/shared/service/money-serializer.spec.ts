import { Decimal } from '@prisma/client/runtime/library'
import { toMoneyNumbers } from './money-serializer'

describe('toMoneyNumbers', () => {
  it('Decimal -> number', () => {
    expect(toMoneyNumbers<any>({ grandTotal: new Decimal('120000.00') })).toEqual({ grandTotal: 120000 })
  })

  it('di sau vao mang va object long nhau', () => {
    const input = {
      orders: [{ items: [{ skuPrice: new Decimal('60000.00'), quantity: 2 }] }],
    }

    expect(toMoneyNumbers<any>(input)).toEqual({ orders: [{ items: [{ skuPrice: 60000, quantity: 2 }] }] })
  })

  it('khong doi Date, string, boolean, null', () => {
    const date = new Date('2026-11-23T00:00:00.000Z')
    const input = { createdAt: date, name: 'Bàn 1', isActive: true, deletedAt: null }

    expect(toMoneyNumbers<any>(input)).toEqual({ createdAt: date, name: 'Bàn 1', isActive: true, deletedAt: null })
  })

  it('khong sua object goc', () => {
    const original = { amount: new Decimal(1000) }
    toMoneyNumbers<any>(original)
    expect(original.amount).toBeInstanceOf(Decimal)
  })
})
