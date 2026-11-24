import { Prisma } from '@prisma/client'
import { checkVoucherUsable, computeVoucherDiscount, VoucherSource } from '@/shared/service/voucher.service'

/**
 * Ticket #02: giá trị giảm phải là SỐ TIỀN cụ thể, và voucher hết hạn/hết lượt phải bị chặn.
 * Test hàm thuần — không cần DB.
 */
const voucher = (over: Partial<VoucherSource> = {}): VoucherSource => ({
  id: 1,
  code: 'GIAM10',
  discountType: 'PERCENT',
  discountValue: '10',
  startAt: new Date('2026-01-01T00:00:00.000Z'),
  endAt: new Date('2026-12-31T23:59:59.000Z'),
  usageLimit: null,
  status: 'ACTIVE',
  ...over,
})

describe('computeVoucherDiscount', () => {
  it('PERCENT: 10% của 250.000 = 25.000 (làm tròn về đồng)', () => {
    const discount = computeVoucherDiscount(voucher(), '250000')
    expect(discount.toNumber()).toBe(25000)
  })

  it('PERCENT lẻ: 7.5% của 199.999 = 15.000 (toDecimalPlaces(0), không lẻ đồng)', () => {
    const discount = computeVoucherDiscount(voucher({ discountValue: '7.5' }), '199999')
    expect(Number.isInteger(discount.toNumber())).toBe(true)
    expect(discount.toNumber()).toBe(15000)
  })

  it('FIXED: giảm đúng số tiền, không vượt tiền món', () => {
    expect(computeVoucherDiscount(voucher({ discountType: 'FIXED', discountValue: '30000' }), '250000').toNumber()).toBe(30000)
    // đơn 20k mà voucher 50k -> chỉ giảm 20k, grandTotal không âm
    expect(computeVoucherDiscount(voucher({ discountType: 'FIXED', discountValue: '50000' }), '20000').toNumber()).toBe(20000)
  })

  it('PERCENT 150% cũng bị chặn ở tiền món', () => {
    expect(computeVoucherDiscount(voucher({ discountValue: '150' }), '100000').toNumber()).toBe(100000)
  })

  it('đơn 0 đồng hoặc voucher 0 -> không giảm gì', () => {
    expect(computeVoucherDiscount(voucher(), '0').toNumber()).toBe(0)
    expect(computeVoucherDiscount(voucher({ discountValue: '0' }), '100000').toNumber()).toBe(0)
  })

  it('cộng bằng Decimal: 0.1 + 0.2 không thành 0.30000000000000004', () => {
    const fixed = voucher({ discountType: 'FIXED', discountValue: '50000' })
    const total = ['0.1', '0.2'].reduce((sum, subtotal) => sum.add(computeVoucherDiscount(fixed, subtotal)), new Prisma.Decimal(0))
    expect(total.toString()).toBe('0.3')
  })
})

describe('checkVoucherUsable', () => {
  const now = new Date('2026-06-01T00:00:00.000Z')

  it('đang trong thời gian + còn lượt -> ok', () => {
    expect(checkVoucherUsable(voucher(), now, 0)).toEqual({ ok: true })
  })

  it('bị ngưng / chưa tới hạn / hết hạn đều bị chặn kèm lý do', () => {
    expect(checkVoucherUsable(voucher({ status: 'INACTIVE' }), now, 0)).toEqual({ ok: false, message: 'Voucher đã bị ngưng' })
    expect(checkVoucherUsable(voucher({ startAt: new Date('2026-07-01T00:00:00.000Z') }), now, 0)).toEqual({
      ok: false,
      message: 'Voucher chưa tới thời gian sử dụng',
    })
    expect(checkVoucherUsable(voucher({ endAt: new Date('2026-05-01T00:00:00.000Z') }), now, 0)).toEqual({
      ok: false,
      message: 'Voucher đã hết hạn',
    })
  })

  it('hết lượt: đã dùng 5/5 -> chặn (không phải dùng 6 mới chặn)', () => {
    expect(checkVoucherUsable(voucher({ usageLimit: 5 }), now, 5)).toEqual({ ok: false, message: 'Voucher đã hết lượt sử dụng' })
    expect(checkVoucherUsable(voucher({ usageLimit: 5 }), now, 4)).toEqual({ ok: true })
  })

  it('không đặt usageLimit = không giới hạn', () => {
    expect(checkVoucherUsable(voucher({ usageLimit: null }), now, 9999)).toEqual({ ok: true })
  })
})
