import { Prisma } from '@prisma/client'
import { computeOrderMoney } from './order-money'

/**
 * Tien phai tinh bang Decimal, khong dung number (Float) — xem ADR 0001 D5.
 * Phu phi: phi phuc vu tinh tren (subtotal - discount), khong tinh tren tip/tax.
 * Tip khoan lam: luon truyen 0, nhung cong thuc van giu so hang.
 */
describe('computeOrderMoney', () => {
  it('tong co ban: 2 mon x so luong', () => {
    const money = computeOrderMoney({
      lines: [
        { price: 45000, quantity: 2 },
        { price: 30000, quantity: 1 },
      ],
    })

    expect(money.subtotal.toString()).toBe('120000')
    expect(money.grandTotal.toString()).toBe('120000')
    expect(money.discountTotal.toString()).toBe('0')
    expect(money.serviceChargeAmount.toString()).toBe('0')
  })

  it('giam gia truoc, phi phuc vu tinh tren phan con lai', () => {
    const money = computeOrderMoney({
      lines: [{ price: 100000, quantity: 1 }],
      discountTotal: 20000,
      serviceChargeRate: 5,
    })

    expect(money.subtotal.toString()).toBe('100000')
    expect(money.discountTotal.toString()).toBe('20000')
    expect(money.serviceChargeAmount.toString()).toBe('4000') // 5% của 80.000
    expect(money.grandTotal.toString()).toBe('84000')
  })

  it('lam tron 2 chu so thap phan', () => {
    const money = computeOrderMoney({
      lines: [{ price: 33.33, quantity: 3 }],
      serviceChargeRate: 10,
    })

    expect(money.subtotal.toString()).toBe('99.99')
    expect(money.serviceChargeAmount.toString()).toBe('10')
    expect(money.grandTotal.toString()).toBe('109.99')
  })

  it('thue va tip cong vao tong, khong chiu phi phuc vu', () => {
    const money = computeOrderMoney({
      lines: [{ price: 200000, quantity: 1 }],
      serviceChargeRate: 10,
      taxTotal: 15000,
      tipAmount: 5000,
    })

    expect(money.serviceChargeAmount.toString()).toBe('20000')
    expect(money.taxTotal.toString()).toBe('15000')
    expect(money.tipAmount.toString()).toBe('5000')
    expect(money.grandTotal.toString()).toBe('240000')
  })

  it('khong dung number: tra ve Decimal', () => {
    const money = computeOrderMoney({ lines: [{ price: 1000, quantity: 1 }] })
    expect(Prisma.Decimal.isDecimal(money.grandTotal)).toBe(true)
  })

  it('giam gia lon hon subtotal thi tong khong am', () => {
    const money = computeOrderMoney({
      lines: [{ price: 50000, quantity: 1 }],
      discountTotal: 70000,
    })

    expect(money.grandTotal.toString()).toBe('0')
  })
})
