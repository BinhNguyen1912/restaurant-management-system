import { Prisma } from '@prisma/client'
import { aggregateSummaries, resolveRange, LedgerRow } from '@/routes/reports/revenue-summary'

/**
 * Ticket #09: bảng tổng hợp phải đúng từng ô.
 * Kịch bản: 2 chi nhánh, 3 ngày, tiền mặt + VNPay + 1 hoàn tiền + 1 đơn giảm giá + thuế.
 */
const at = (iso: string) => new Date(iso)

const row = (over: Partial<LedgerRow> & Pick<LedgerRow, 'accountCode' | 'direction' | 'amount'>): LedgerRow => ({
  branchId: 1,
  occurredAt: at('2026-11-20T03:00:00.000Z'), // 10:00 giờ VN
  refType: 'ORDER_PAID_CASH',
  refId: 1,
  ...over,
})

/** 1 đơn tiền mặt: khách trả 108.500 = món 100.000 − giảm 0 + phí 5.000 + VAT 3.500 */
const cashOrder: LedgerRow[] = [
  row({ accountCode: 'CASH', direction: 'DEBIT', amount: '108500', refId: 1 }),
  row({ accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount: '100000', refId: 1 }),
  row({ accountCode: 'SERVICE_CHARGE', direction: 'CREDIT', amount: '5000', refId: 1 }),
  row({ accountCode: 'TAX_PAYABLE', direction: 'CREDIT', amount: '3500', refId: 1 }),
]

describe('aggregateSummaries — bảng tổng hợp doanh thu', () => {
  it('đơn tiền mặt: đủ từng ô, grandTotal = tiền khách trả', () => {
    const [cell] = aggregateSummaries(cashOrder)
    expect(cell.date).toBe('2026-11-20')
    expect(cell.gross.toNumber()).toBe(100000)
    expect(cell.discount.toNumber()).toBe(0)
    expect(cell.serviceCharge.toNumber()).toBe(5000)
    expect(cell.tax.toNumber()).toBe(3500)
    expect(cell.net.toNumber()).toBe(105000) // doanh thu thuần = món + phí, chưa VAT
    expect(cell.grandTotal.toNumber()).toBe(108500)
    expect(cell.cashIn.toNumber()).toBe(108500)
    expect(cell.vnpayIn.toNumber()).toBe(0)
    expect(cell.orderCount).toBe(1)
  })

  it('đơn giảm giá: gross là tiền món trước giảm, net đã trừ giảm', () => {
    const [cell] = aggregateSummaries([
      row({ accountCode: 'CASH', direction: 'DEBIT', amount: '90000', refId: 2 }),
      row({ accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount: '90000', refId: 2 }),
      // giảm giá 10.000: dòng Nợ DISCOUNT
      row({ accountCode: 'DISCOUNT', direction: 'DEBIT', amount: '10000', refId: 2 }),
    ])
    // REVENUE_FOOD credit đã là "sau giảm giá" theo cách buildOrderLedgerLines ghi sổ
    expect(cell.gross.toNumber()).toBe(100000)
    expect(cell.discount.toNumber()).toBe(10000)
    expect(cell.net.toNumber()).toBe(90000)
    expect(cell.grandTotal.toNumber()).toBe(90000)
  })

  it('VNPay cộng vào vnpayIn, không vào cashIn', () => {
    const [cell] = aggregateSummaries([
      row({ accountCode: 'VNPAY_CLEARING', direction: 'DEBIT', amount: '50000', refType: 'ORDER_PAID_VNPAY', refId: 3 }),
      row({ accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount: '50000', refType: 'ORDER_PAID_VNPAY', refId: 3 }),
    ])
    expect(cell.vnpayIn.toNumber()).toBe(50000)
    expect(cell.cashIn.toNumber()).toBe(0)
    expect(cell.orderCount).toBe(1)
  })

  it('hoàn tiền: ghi vào refund, trừ khỏi doanh thu và khỏi tiền vào', () => {
    const day = [
      ...cashOrder,
      // hoàn 108.500 cho khách: Nợ doanh thu/thuế, Có CASH
      row({ accountCode: 'REVENUE_FOOD', direction: 'DEBIT', amount: '100000', refType: 'REFUND', refId: 9 }),
      row({ accountCode: 'SERVICE_CHARGE', direction: 'DEBIT', amount: '5000', refType: 'REFUND', refId: 9 }),
      row({ accountCode: 'TAX_PAYABLE', direction: 'DEBIT', amount: '3500', refType: 'REFUND', refId: 9 }),
      row({ accountCode: 'CASH', direction: 'CREDIT', amount: '108500', refType: 'REFUND', refId: 9 }),
    ]
    const [cell] = aggregateSummaries(day)
    expect(cell.refund.toNumber()).toBe(100000) // phần doanh thu món đã hoàn
    expect(cell.net.toNumber()).toBe(0)
    expect(cell.cashIn.toNumber()).toBe(0)
    expect(cell.grandTotal.toNumber()).toBe(0)
  })

  it('COGS là chi phí: ghi Nợ thì cột cogs TĂNG (không âm)', () => {
    const [cell] = aggregateSummaries([
      ...cashOrder,
      row({ accountCode: 'COGS', direction: 'DEBIT', amount: '40000', refType: 'ORDER_COGS', refId: 1 }),
      row({ accountCode: 'INVENTORY', direction: 'CREDIT', amount: '40000', refType: 'ORDER_COGS', refId: 1 }),
    ])
    expect(cell.cogs.toNumber()).toBe(40000)
    // và không ảnh hưởng doanh thu
    expect(cell.grandTotal.toNumber()).toBe(108500)
  })

  it('2 chi nhánh × 3 ngày: tách ô đúng, không lẫn chi nhánh/ngày', () => {
    const rows: LedgerRow[] = []
    for (const [branchId, day] of [
      [1, '2026-11-20'],
      [1, '2026-11-21'],
      [1, '2026-11-22'],
      [2, '2026-11-20'],
      [2, '2026-11-21'],
      [2, '2026-11-22'],
    ] as const) {
      rows.push(
        row({
          branchId,
          occurredAt: at(`${day}T03:00:00.000Z`),
          accountCode: 'CASH',
          direction: 'DEBIT',
          amount: branchId === 1 ? '100000' : '70000',
          refId: Number(day.slice(-2)),
        }),
        row({
          branchId,
          occurredAt: at(`${day}T03:00:00.000Z`),
          accountCode: 'REVENUE_FOOD',
          direction: 'CREDIT',
          amount: branchId === 1 ? '100000' : '70000',
          refId: Number(day.slice(-2)),
        }),
      )
    }

    const cells = aggregateSummaries(rows)
    expect(cells).toHaveLength(6)
    const chiNhanh1 = cells.filter((cell) => cell.branchId === 1)
    const chiNhanh2 = cells.filter((cell) => cell.branchId === 2)
    expect(chiNhanh1.map((c) => c.date)).toEqual(['2026-11-20', '2026-11-21', '2026-11-22'])
    expect(chiNhanh1.reduce((sum, c) => sum + c.grandTotal.toNumber(), 0)).toBe(300000)
    expect(chiNhanh2.reduce((sum, c) => sum + c.grandTotal.toNumber(), 0)).toBe(210000)
  })

  it('biên ngày theo giờ VN: 23:30 hôm nay và 00:30 hôm sau khác ngày', () => {
    const cells = aggregateSummaries([
      // 2026-11-20T23:30+07:00 = 16:30Z
      row({ occurredAt: at('2026-11-20T16:30:00.000Z'), accountCode: 'CASH', direction: 'DEBIT', amount: '1000' }),
      // 2026-11-21T00:30+07:00 = 2026-11-20T17:30Z
      row({ occurredAt: at('2026-11-20T17:30:00.000Z'), accountCode: 'CASH', direction: 'DEBIT', amount: '2000' }),
    ])
    expect(cells.map((c) => c.date)).toEqual(['2026-11-20', '2026-11-21'])
  })

  it('bỏ qua dòng DRAFT/0 đồng, không đếm trùng đơn', () => {
    const cells = aggregateSummaries([
      ...cashOrder,
      row({ accountCode: 'CASH', direction: 'DEBIT', amount: 0 }),
      // cùng 1 đơn: thêm 1 dòng nữa cũng không tăng orderCount
      row({ accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount: 0 }),
    ])
    expect(cells).toHaveLength(1)
    expect(cells[0].orderCount).toBe(1)
  })
})

describe('resolveRange', () => {
  it('mặc định là hôm nay, biên ngày theo +07:00', () => {
    const range = resolveRange('2026-11-01', '2026-11-30')
    expect(range.from).toBe('2026-11-01')
    expect(range.to).toBe('2026-11-30')
    expect(range.gte.toISOString()).toBe('2026-10-31T17:00:00.000Z') // 00:00 VN
    expect(range.lte.toISOString()).toBe('2026-11-30T16:59:59.999Z') // 23:59:59.999 VN
  })

  it('nhận ISO đầy đủ (dashboard gửi) và cắt về ngày', () => {
    const range = resolveRange('2026-03-02T00:00:00.000+07:00', '2026-03-04T23:59:59.999+07:00')
    expect(range.from).toBe('2026-03-02')
    expect(range.to).toBe('2026-03-04')
    expect(range.gte.toISOString()).toBe('2026-03-01T17:00:00.000Z')
  })

  it('thiếu fromDate thì dùng toDate cho cả hai', () => {
    const range = resolveRange(undefined, '2026-11-30')
    expect(range.from).toBe(range.to)
  })
})

describe('Decimal an toàn', () => {
  it('cộng dồn không bị sai số thực', () => {
    const rows: LedgerRow[] = Array.from({ length: 3 }, (_, i) =>
      row({ accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount: new Prisma.Decimal('0.1').mul(1000), refId: i + 1 }),
    )
    const [cell] = aggregateSummaries(rows)
    expect(cell.net.toNumber()).toBe(300)
  })
})
