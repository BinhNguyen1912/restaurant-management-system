import { computeDepositSettlementAmount } from '@/shared/service/deposit-settlement'

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
