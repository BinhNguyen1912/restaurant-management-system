import { Prisma } from '@prisma/client'
import {
  classifyPayment,
  classifyVnpay,
  EntrySnapshot,
  PaymentSnapshot,
  selectEntriesForPayment,
  summarizeItems,
} from '@/routes/reconciliation/reconciliation-check'

/**
 * Ticket #13 yêu cầu đúng kịch bản kiểm thử: "1 khớp, 1 lệch tiền, 1 thiếu bút toán
 * → 3 item phân loại đúng". Test bằng dữ liệu giả lập, không cần DB.
 */
const payment = (over: Partial<PaymentSnapshot> = {}): PaymentSnapshot => ({
  id: 1,
  amount: '100000',
  method: 'CASH',
  transactionId: null,
  ...over,
})

const entry = (over: Partial<EntrySnapshot> = {}): EntrySnapshot => ({
  id: 10,
  status: 'POSTED',
  refType: 'ORDER_PAID_CASH',
  refId: 1,
  receivedAmount: '100000',
  ...over,
})

describe('classifyPayment — Payment ↔ sổ cái', () => {
  it('khớp: 1 bút toán POSTED, số tiền đúng', () => {
    const item = classifyPayment(payment(), [entry()])
    expect(item.kind).toBe('MATCHED')
    expect(item.amountDelta.toNumber()).toBe(0)
    expect(item.ledgerEntryId).toBe(10)
  })

  it('thiếu bút toán: tiền đã thu, sổ không có → MISSING_IN_LEDGER, delta âm', () => {
    const item = classifyPayment(payment(), [])
    expect(item.kind).toBe('MISSING_IN_LEDGER')
    expect(item.amountActual.toNumber()).toBe(0)
    expect(item.amountDelta.toNumber()).toBe(-100000)
    expect(item.ledgerEntryId).toBeNull()
  })

  it('bút toán còn DRAFT cũng là thiếu (chưa post = sổ chưa có), giữ id để tra', () => {
    const item = classifyPayment(payment(), [entry({ status: 'DRAFT' })])
    expect(item.kind).toBe('MISSING_IN_LEDGER')
    expect(item.ledgerEntryId).toBe(10)
    expect(item.detail).toEqual({ draftsPending: 1 })
  })

  it('lệch tiền: bút toán ghi 90.000 nhưng khách trả 100.000 → AMOUNT_MISMATCH', () => {
    const item = classifyPayment(payment(), [entry({ receivedAmount: '90000' })])
    expect(item.kind).toBe('AMOUNT_MISMATCH')
    expect(item.amountActual.toNumber()).toBe(90000)
    expect(item.amountDelta.toNumber()).toBe(-10000)
  })

  it('trùng: 2 bút toán cho cùng 1 payment → DUPLICATE, tổng cả 2 để thấy ghi thừa bao nhiêu', () => {
    const item = classifyPayment(payment(), [entry({ id: 10 }), entry({ id: 11 })])
    expect(item.kind).toBe('DUPLICATE')
    expect(item.amountActual.toNumber()).toBe(200000)
    expect(item.amountDelta.toNumber()).toBe(100000)
    expect(item.detail).toEqual({ entryIds: [10, 11] })
  })

  it('VNPay: nhận tiền ở VNPAY_CLEARING cũng phân loại y hệt tiền mặt', () => {
    const item = classifyPayment(
      payment({ method: 'VNPAY', transactionId: '14001234' }),
      [entry({ refType: 'ORDER_PAID_VNPAY', receivedAmount: '100000' })],
    )
    expect(item.kind).toBe('MATCHED')
    expect(item.transactionId).toBe('14001234')
  })
})

describe('classifyVnpay — so với querydr', () => {
  it('không gọi được API (undefined) thì KHÔNG kết luận gì (null)', () => {
    expect(classifyVnpay(payment(), undefined)).toBeNull()
  })

  it('gateway báo thành công + đúng tiền → MATCHED', () => {
    const item = classifyVnpay(payment(), { status: '00', amount: 100000 })
    expect(item?.kind).toBe('MATCHED')
  })

  it('gateway báo lỗi (khác 00) trong khi nội bộ SUCCESS → STATUS_MISMATCH', () => {
    const item = classifyVnpay(payment(), { status: '24', amount: 100000 })
    expect(item?.kind).toBe('STATUS_MISMATCH')
    expect(item?.detail).toEqual({ gatewayStatus: '24' })
  })

  it('gateway trả số tiền khác → AMOUNT_MISMATCH', () => {
    const item = classifyVnpay(payment(), { status: '00', amount: 99000 })
    expect(item?.kind).toBe('AMOUNT_MISMATCH')
    expect(item?.amountDelta.toNumber()).toBe(-1000)
  })
})

describe('summarizeItems', () => {
  it('đếm theo kind + tổng tiền + chênh lệch tuyệt đối', () => {
    const items = [
      classifyPayment(payment({ id: 1 }), [entry({ refId: 1 })]),
      classifyPayment(payment({ id: 2 }), [entry({ id: 20, refId: 2, receivedAmount: '90000' })]),
      classifyPayment(payment({ id: 3 }), []),
    ]
    const summary = summarizeItems(items)
    expect(summary.byKind).toEqual({ MATCHED: 1, AMOUNT_MISMATCH: 1, MISSING_IN_LEDGER: 1 })
    expect(summary.paymentsChecked).toBe(3)
    expect(summary.expectedTotal).toBe('300000')
    expect(summary.actualTotal).toBe('190000')
    expect(summary.difference).toBe('-110000')
    expect(summary.absDifference).toBe('110000')
  })

  it('không có item nào → tổng 0, không NaN', () => {
    const summary = summarizeItems([])
    expect(summary.byKind).toEqual({})
    expect(summary.difference).toBe('0')
    expect(new Prisma.Decimal(summary.actualTotal).toNumber()).toBe(0)
  })
})

describe('selectEntriesForPayment — bút toán phải cùng chi nhánh', () => {
  const row = (branchId: number, snapshot: Partial<EntrySnapshot> = {}) => ({
    branchId,
    snapshot: entry(snapshot),
  })

  it('bút toán cùng refId nhưng KHÁC chi nhánh không được ghép vào payment', () => {
    const byRefId = new Map([[1, [row(2, { id: 20 })]]])
    expect(selectEntriesForPayment({ id: 1, branchId: 1 }, byRefId)).toEqual([])
  })

  it('cùng chi nhánh thì ghép, kể cả khi có bút toán chi nhánh khác trùng refId', () => {
    const byRefId = new Map([
      [
        1,
        [row(2, { id: 20 }), row(1, { id: 21 })],
      ],
    ])
    const picked = selectEntriesForPayment({ id: 1, branchId: 1 }, byRefId)
    expect(picked.map((item) => item.snapshot.id)).toEqual([21])
  })

  it('payment cũ chưa có branchId thì ghép theo refId (không báo lệch giả cho dữ liệu cũ)', () => {
    const byRefId = new Map([
      [
        1,
        [row(2, { id: 20 }), row(1, { id: 21 })],
      ],
    ])
    expect(selectEntriesForPayment({ id: 1, branchId: null }, byRefId)).toHaveLength(2)
  })

  it('không có bút toán nào trùng refId → rỗng (MISSING_IN_LEDGER)', () => {
    expect(selectEntriesForPayment({ id: 99, branchId: 1 }, new Map())).toEqual([])
  })
})
