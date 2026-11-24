import { Prisma } from '@prisma/client'
import { cashShiftTotals, cashVariance, cashVarianceLines } from './cash-shift-math'

/**
 * Ticket P2-1: ca co 3 don tien mat + 1 khoan chi -> variance dung.
 */
describe('cashShiftTotals', () => {
  it('ca 3 don tien mat (600k) + 1 khoan chi (100k), float 500k -> két phai co 1.000k', () => {
    const totals = cashShiftTotals({
      openingFloat: 500_000,
      cashIn: new Prisma.Decimal(150_000).plus(200_000).plus(250_000),
      cashOut: 100_000,
    })
    expect(totals.expectedCash.toFixed(2)).toBe('1000000.00')
  })

  it('thu tay (IN) cong vao két, chi (OUT) tru ra', () => {
    const totals = cashShiftTotals({
      openingFloat: 200_000,
      cashIn: 0,
      cashInMovements: 300_000,
      cashOut: 50_000,
    })
    expect(totals.expectedCash.toFixed(2)).toBe('450000.00')
  })

  it('khong co phat sinh -> két = tien le dau ca', () => {
    expect(cashShiftTotals({ openingFloat: '120000.00', cashIn: 0, cashOut: 0 }).expectedCash.toFixed(2)).toBe(
      '120000.00',
    )
  })

  it('tien le / doanh thu co duoi .00 van chinh xac (khong sai so float)', () => {
    const totals = cashShiftTotals({ openingFloat: '0.10', cashIn: '0.20', cashOut: 0 })
    expect(totals.expectedCash.toFixed(2)).toBe('0.30')
  })
})

describe('cashVariance', () => {
  it('dem thieu -> variance am', () => {
    expect(cashVariance(1_000_000, 980_000).toFixed(2)).toBe('-20000.00')
  })

  it('dem thua -> variance duong', () => {
    expect(cashVariance(1_000_000, 1_050_000).toFixed(2)).toBe('50000.00')
  })

  it('dem dung -> 0', () => {
    expect(cashVariance(1_000_000, 1_000_000).isZero()).toBe(true)
  })
})

describe('cashVarianceLines', () => {
  it('khop ket -> khong sinh but toan', () => {
    expect(cashVarianceLines(0)).toEqual([])
  })

  it('thieu 20k -> No CASH_SHORTAGE / Co CASH, Nơ = Có', () => {
    const lines = cashVarianceLines(-20_000)
    expect(lines.map((line) => `${line.direction} ${line.accountCode} ${line.amount.toFixed(2)}`)).toEqual([
      'DEBIT CASH_SHORTAGE 20000.00',
      'CREDIT CASH 20000.00',
    ])
  })

  it('thua 50k -> No CASH / Co CASH_OVERAGE', () => {
    const lines = cashVarianceLines(50_000)
    expect(lines.map((line) => `${line.direction} ${line.accountCode} ${line.amount.toFixed(2)}`)).toEqual([
      'DEBIT CASH 50000.00',
      'CREDIT CASH_OVERAGE 50000.00',
    ])
  })
})
