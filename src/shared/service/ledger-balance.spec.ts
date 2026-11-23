import { Prisma } from '@prisma/client'
import { checkBalanced, sumByDirection } from './ledger-balance'

/**
 * Bất biến số 1 của sổ cái (ADR 0001 D1): mỗi bút toán Σ Nợ = Σ Có.
 * Mọi bất thường phải ném lỗi — không bao giờ ghi một bút toán lệch.
 */
describe('checkBalanced', () => {
  it('cân: 189.000 Nợ = 180.000 + 9.000 Có', () => {
    const result = checkBalanced([
      { direction: 'DEBIT', amount: 189000 },
      { direction: 'CREDIT', amount: 180000 },
      { direction: 'CREDIT', amount: 9000 },
    ])

    expect(result.debit.toString()).toBe('189000')
    expect(result.credit.toString()).toBe('189000')
    expect(result.difference.toString()).toBe('0')
  })

  it('lệch 1 đồng cũng phải ném lỗi, và nói rõ lệch bao nhiêu', () => {
    expect(() =>
      checkBalanced([
        { direction: 'DEBIT', amount: 189000 },
        { direction: 'CREDIT', amount: 188999 },
      ]),
    ).toThrow(/1/)
  })

  it('không có dòng nào thì từ chối (bút toán rỗng là vô nghĩa)', () => {
    expect(() => checkBalanced([])).toThrow()
  })

  it('số tiền 0 hoặc âm bị từ chối', () => {
    expect(() =>
      checkBalanced([
        { direction: 'DEBIT', amount: 0 },
        { direction: 'CREDIT', amount: 0 },
      ]),
    ).toThrow()
    expect(() =>
      checkBalanced([
        { direction: 'DEBIT', amount: -1000 },
        { direction: 'CREDIT', amount: -1000 },
      ]),
    ).toThrow()
  })

  it('Decimal không sai số: 0.1 + 0.2 = 0.3 là cân', () => {
    const result = checkBalanced([
      { direction: 'DEBIT', amount: new Prisma.Decimal('0.1') },
      { direction: 'DEBIT', amount: new Prisma.Decimal('0.2') },
      { direction: 'CREDIT', amount: new Prisma.Decimal('0.3') },
    ])

    expect(result.difference.toString()).toBe('0')
  })

  it('nhiều dòng mỗi bên vẫn kiểm đúng tổng', () => {
    const result = checkBalanced([
      { direction: 'DEBIT', amount: 50000 },
      { direction: 'DEBIT', amount: '250000' },
      { direction: 'CREDIT', amount: 200000 },
      { direction: 'CREDIT', amount: 100000 },
    ])

    expect(result.debit.toString()).toBe('300000')
    expect(result.credit.toString()).toBe('300000')
  })

  it('số tiền rác (NaN/chuỗi lạ) bị từ chối', () => {
    expect(() =>
      checkBalanced([
        { direction: 'DEBIT', amount: 'khong-phai-so' },
        { direction: 'CREDIT', amount: 1000 },
      ]),
    ).toThrow()
  })
})

describe('sumByDirection', () => {
  it('cộng đúng theo từng chiều', () => {
    const lines = [
      { direction: 'DEBIT' as const, amount: 1000 },
      { direction: 'CREDIT' as const, amount: 400 },
      { direction: 'DEBIT' as const, amount: '250.50' },
    ]

    expect(sumByDirection(lines, 'DEBIT').toString()).toBe('1250.5')
    expect(sumByDirection(lines, 'CREDIT').toString()).toBe('400')
  })

  it('không có dòng nào của chiều đó thì trả 0, không NaN', () => {
    expect(sumByDirection([], 'DEBIT').toString()).toBe('0')
  })
})
