import { computeDepositAmount } from './deposit-policy'

describe('computeDepositAmount', () => {
  it('30% cua 1.000.000 la 300.000', () => {
    expect(computeDepositAmount(1_000_000, 30)).toBe(300_000)
  })

  it('lam tron ve dong theo ROUND_HALF_UP', () => {
    expect(computeDepositAmount(333, 30)).toBe(100)
    expect(computeDepositAmount(335, 30)).toBe(101)
  })

  it('100% la toan bo gia tri mon dat truoc', () => {
    expect(computeDepositAmount(250_000, 100)).toBe(250_000)
  })

  it('tu choi muc coc ngoai 30/50/70/100', () => {
    expect(() => computeDepositAmount(1_000_000, 40)).toThrow(/30, 50, 70, or 100/)
    expect(() => computeDepositAmount(1_000_000, 0)).toThrow(/30, 50, 70, or 100/)
  })
})
