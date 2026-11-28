import { computeDepositSettlementAmount, computeOutstandingAmount } from '@/shared/service/deposit-settlement'

describe('computeDepositSettlementAmount', () => {
  it('hoá đơn lớn hơn cọc -> tất toán đúng số cọc', () => {
    expect(computeDepositSettlementAmount(500_000, 2_000_000).toNumber()).toBe(500_000)
  })

  it('hoá đơn nhỏ hơn cọc -> chỉ tất toán phần dùng được, phần dư vẫn là nợ khách', () => {
    expect(computeDepositSettlementAmount(500_000, 300_000).toNumber()).toBe(300_000)
  })

  it('không có cọc / cọc 0 / hoá đơn 0 -> 0 (không sinh bút toán rác)', () => {
    expect(computeDepositSettlementAmount(null, 100_000).toNumber()).toBe(0)
    expect(computeDepositSettlementAmount(0, 100_000).toNumber()).toBe(0)
    expect(computeDepositSettlementAmount(500_000, 0).toNumber()).toBe(0)
  })

  it('làm tròn về đồng (VND không có đơn vị lẻ)', () => {
    expect(Number.isInteger(computeDepositSettlementAmount('500000.7', '2000000').toNumber())).toBe(true)
  })
})

describe('computeOutstandingAmount', () => {
  it('hoá đơn 1.000.000 có cọc 300.000 -> còn phải thu 700.000', () => {
    expect(computeOutstandingAmount(1_000_000, 300_000).toNumber()).toBe(700_000)
  })

  it('không có cọc / cọc 0 -> còn phải thu đủ hoá đơn', () => {
    expect(computeOutstandingAmount(1_000_000, null).toNumber()).toBe(1_000_000)
    expect(computeOutstandingAmount(1_000_000, undefined).toNumber()).toBe(1_000_000)
    expect(computeOutstandingAmount(1_000_000, 0).toNumber()).toBe(1_000_000)
  })

  it('cọc lớn hơn hoá đơn -> 0 (cọc đã phủ hết, không đòi thêm)', () => {
    expect(computeOutstandingAmount(1_000_000, 1_500_000).toNumber()).toBe(0)
  })

  it('hoá đơn âm -> 0', () => {
    expect(computeOutstandingAmount(-1, 0).toNumber()).toBe(0)
    expect(computeOutstandingAmount(-1, 500_000).toNumber()).toBe(0)
  })
})
