import { summarizeLines } from '@/routes/ledger-entry/ledger-entry-balance'

describe('summarizeLines (nhật ký sổ cái)', () => {
  it('1 Nợ = 1 Có -> cân', () => {
    const result = summarizeLines([
      { direction: 'DEBIT', amount: 120_000 },
      { direction: 'CREDIT', amount: 120_000 },
    ])
    expect(result.balanced).toBe(true)
    expect(result.debitTotal.toFixed(2)).toBe('120000.00')
  })

  it('bút toán bán hàng 3 dòng: Nợ 161.028 = Có 142.000 + 7.100 + 11.928 -> cân', () => {
    const result = summarizeLines([
      { direction: 'DEBIT', amount: 161_028 },
      { direction: 'CREDIT', amount: 142_000 },
      { direction: 'CREDIT', amount: 7_100 },
      { direction: 'CREDIT', amount: 11_928 },
    ])
    expect(result.balanced).toBe(true)
  })

  it('thiếu 1 dòng Có -> lệch, biết được lệch bao nhiêu', () => {
    const result = summarizeLines([
      { direction: 'DEBIT', amount: 161_028 },
      { direction: 'CREDIT', amount: 142_000 },
    ])
    expect(result.balanced).toBe(false)
    expect(result.debitTotal.minus(result.creditTotal).toFixed(2)).toBe('19028.00')
  })

  it('chỉ 1 dòng -> không cân dù số bằng nhau', () => {
    expect(summarizeLines([{ direction: 'DEBIT', amount: 0 }]).balanced).toBe(false)
  })

  it('số lẻ thập phân vẫn chính xác (không sai số float)', () => {
    const result = summarizeLines([
      { direction: 'DEBIT', amount: '0.10' },
      { direction: 'CREDIT', amount: '0.10' },
    ])
    expect(result.balanced).toBe(true)
  })
})
