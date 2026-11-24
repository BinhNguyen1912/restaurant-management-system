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

  it('lam tron ve dong nguyen (VND khong co don vi le)', () => {
    const money = computeOrderMoney({
      lines: [{ price: 33.33, quantity: 3 }],
      serviceChargeRate: 10,
    })

    expect(money.subtotal.toString()).toBe('99.99')
    expect(money.serviceChargeAmount.toString()).toBe('10')
    expect(money.grandTotal.toString()).toBe('110')
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

/**
 * VAT (chốt với chủ dự án): cấu hình theo CHI NHÁNH, snapshot vào đơn.
 * - pricesIncludeTax = true  (mặc định VN): giá menu đã gồm VAT -> TRÍCH thuế ra, tổng không đổi
 * - pricesIncludeTax = false             : giá menu chưa gồm VAT -> CỘNG thuế lên trên
 */
describe('computeOrderMoney — VAT', () => {
  it('giá đã gồm VAT 8%: trích thuế từ hoá đơn, tổng giữ nguyên', () => {
    const money = computeOrderMoney({
      lines: [{ price: 108_000, quantity: 1 }],
      taxRate: 8,
      pricesIncludeTax: true,
    })

    expect(money.grandTotal.toString()).toBe('108000')
    expect(money.taxTotal.toFixed(2)).toBe('8000.00')
    // doanh thu thuần = 108.000 - 8.000
    expect(money.revenue.toFixed(2)).toBe('100000.00')
    // Nợ = Có: revenue + tax = grandTotal
    expect(money.revenue.add(money.taxTotal).toString()).toBe(money.grandTotal.toString())
  })

  it('giá chưa gồm VAT 10%: cộng thuế lên trên', () => {
    const money = computeOrderMoney({
      lines: [{ price: 100_000, quantity: 1 }],
      taxRate: 10,
      pricesIncludeTax: false,
    })

    expect(money.taxTotal.toFixed(2)).toBe('10000.00')
    expect(money.grandTotal.toFixed(2)).toBe('110000.00')
    expect(money.revenue.toFixed(2)).toBe('100000.00')
  })

  it('VAT tính trên (tiền món sau giảm giá + phí phục vụ)', () => {
    const money = computeOrderMoney({
      lines: [{ price: 100_000, quantity: 1 }],
      discountTotal: 10_000,
      serviceChargeRate: 5,
      taxRate: 8,
      pricesIncludeTax: false,
    })
    // 90.000 + 5% = 94.500 -> VAT 8% = 7.560 -> tổng 102.060
    expect(money.serviceChargeAmount.toFixed(2)).toBe('4500.00')
    expect(money.taxTotal.toFixed(2)).toBe('7560.00')
    expect(money.grandTotal.toFixed(2)).toBe('102060.00')
  })

  it('VAT trích ra khi giá đã gồm: vẫn cân với phí phục vụ', () => {
    const money = computeOrderMoney({
      lines: [{ price: 100_000, quantity: 1 }],
      serviceChargeRate: 5,
      taxRate: 10,
      pricesIncludeTax: true,
    })
    // bill 105.000 đã gồm VAT 10% -> thuế = 105.000/110*10 = 9.545,45 -> làm tròn 9.545 đồng
    expect(money.grandTotal.toFixed(2)).toBe('105000.00')
    expect(money.taxTotal.toFixed(2)).toBe('9545.00')
    expect(money.revenue.add(money.serviceChargeAmount).add(money.taxTotal).toFixed(2)).toBe('105000.00')
  })

  it('taxRate = 0 -> không có thuế (chi nhánh chưa cấu hình)', () => {
    const money = computeOrderMoney({ lines: [{ price: 60_000, quantity: 1 }], taxRate: 0 })
    expect(money.taxTotal.toString()).toBe('0')
    expect(money.grandTotal.toString()).toBe('60000')
  })

  it('số thue cho san (taxTotal) van uu tien — tuong thich code cu', () => {
    const money = computeOrderMoney({ lines: [{ price: 100_000, quantity: 1 }], taxTotal: 8_000, taxRate: 10 })
    expect(money.taxTotal.toString()).toBe('8000')
    expect(money.grandTotal.toString()).toBe('108000')
  })
})
