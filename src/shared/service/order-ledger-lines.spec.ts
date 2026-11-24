import { Prisma } from '@prisma/client'
import { buildOrderLedgerLines } from './order-ledger-lines'
import { checkBalanced } from './ledger-balance'

/**
 * Dòng bút toán của 1 đơn — cam kết Σ Nợ = Σ Có trong MỌI trường hợp,
 * kể cả dữ liệu cũ bị backfill lệch (khi đó có dòng ROUNDING_ADJUSTMENT).
 */
const sum = (lines: { direction: 'DEBIT' | 'CREDIT'; amount: Prisma.Decimal }[], direction: 'DEBIT' | 'CREDIT') =>
  lines
    .filter((line) => line.direction === direction)
    .reduce((total, line) => total.add(line.amount), new Prisma.Decimal(0))

const parts = {
  grandTotal: 189000,
  subtotal: 200000,
  discountTotal: 20000,
  serviceChargeAmount: 9000,
  taxTotal: 0,
}

describe('buildOrderLedgerLines', () => {
  it('đơn có giảm giá + phí phục vụ: Nợ tiền = doanh thu + phí', () => {
    const lines = buildOrderLedgerLines(parts, 'CASH')

    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ accountCode: 'CASH', direction: 'DEBIT' })
    expect(String(lines[0].amount)).toBe('189000')
    expect(lines[1]).toMatchObject({ accountCode: 'REVENUE_FOOD', direction: 'CREDIT' })
    expect(String(lines[1].amount)).toBe('180000')
    expect(lines[2]).toMatchObject({ accountCode: 'SERVICE_CHARGE', direction: 'CREDIT' })
    expect(String(lines[2].amount)).toBe('9000')
    expect(() => checkBalanced(lines)).not.toThrow()
  })

  it('VNPay: Nợ vào tài khoản chờ về, không phải tiền mặt', () => {
    const lines = buildOrderLedgerLines(parts, 'VNPAY_CLEARING')
    expect(lines[0].accountCode).toBe('VNPAY_CLEARING')
  })

  it('có thuế thì tách ra TAX_PAYABLE, không gộp vào doanh thu', () => {
    const lines = buildOrderLedgerLines(
      { grandTotal: 204120, subtotal: 200000, discountTotal: 20000, serviceChargeAmount: 9000, taxTotal: 15120 },
      'CASH',
    )

    expect(lines.find((line) => line.accountCode === 'TAX_PAYABLE')).toMatchObject({ direction: 'CREDIT' })
    expect(() => checkBalanced(lines)).not.toThrow()
  })

  it('đơn cũ backfill lệch: chênh lệch vào ROUNDING_ADJUSTMENT, bút toán vẫn cân', () => {
    // grandTotal = 114000 nhưng subtotal cũng 114000 và không có phí -> cân tự nhiên
    const balanced = buildOrderLedgerLines(
      { grandTotal: 114000, subtotal: 114000, discountTotal: 0, serviceChargeAmount: 0, taxTotal: 0 },
      'CASH',
    )
    expect(() => checkBalanced(balanced)).not.toThrow()
    expect(balanced.some((line) => line.accountCode === 'ROUNDING_ADJUSTMENT')).toBe(false)

    // dữ liệu lệch: grandTotal 189000 nhưng phần doanh thu chỉ 170000 -> phải có dòng chênh
    const withDiff = buildOrderLedgerLines(
      { grandTotal: 189000, subtotal: 170000, discountTotal: 0, serviceChargeAmount: 0, taxTotal: 0 },
      'CASH',
    )
    expect(withDiff.find((line) => line.accountCode === 'ROUNDING_ADJUSTMENT')).toMatchObject({
      direction: 'CREDIT',
      amount: expect.anything(),
    })
    expect(String(sum(withDiff, 'CREDIT'))).toBe('189000')
    expect(() => checkBalanced(withDiff)).not.toThrow()
  })

  it('dòng 0 đồng bị bỏ (DB cấm tiền <= 0)', () => {
    const lines = buildOrderLedgerLines(
      { grandTotal: 100000, subtotal: 100000, discountTotal: 0, serviceChargeAmount: 0, taxTotal: 0 },
      'CASH',
    )
    expect(lines.some((line) => line.amount.isZero())).toBe(false)
    expect(/SERVICE_CHARGE/.test(lines.map((line) => line.accountCode).join())).toBe(false)
  })

  it('đơn 0 đồng không sinh bút toán', () => {
    expect(buildOrderLedgerLines({ ...parts, grandTotal: 0 }, 'CASH')).toHaveLength(0)
  })

  it('giảm giá lớn hơn subtotal: doanh thu về 0, phần còn lại vẫn cân', () => {
    const lines = buildOrderLedgerLines(
      { grandTotal: 50000, subtotal: 40000, discountTotal: 45000, serviceChargeAmount: 0, taxTotal: 0 },
      'CASH',
    )
    expect(() => checkBalanced(lines)).not.toThrow()
    expect(String(lines[0].amount)).toBe('50000')
  })
})
