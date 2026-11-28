import { Prisma } from '@prisma/client'

/**
 * Phân loại sai lệch đối soát (ticket #13) — hàm THUẦN, không chạm DB, để test được
 * đúng 3 ca mà ticket yêu cầu (khớp / lệch tiền / thiếu bút toán) mà không cần dựng cả hệ thống.
 *
 * Nguyên tắc: đối soát là so **Payment** (tiền thật đã thu) với **bút toán** (sổ đã ghi).
 * Sổ là nguồn sự thật về doanh thu, Payment là nguồn sự thật về tiền vào — lệch giữa hai cái
 * chính là việc cần tìm.
 */

export const RECONCILIATION_KIND = {
  MATCHED: 'MATCHED',
  MISSING_IN_LEDGER: 'MISSING_IN_LEDGER',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  DUPLICATE: 'DUPLICATE',
  STATUS_MISMATCH: 'STATUS_MISMATCH',
} as const

export type ReconciliationKind = (typeof RECONCILIATION_KIND)[keyof typeof RECONCILIATION_KIND]

export type PaymentSnapshot = {
  id: number
  amount: Prisma.Decimal.Value
  method: string | null
  transactionId: string | null
}

/** 1 bút toán ứng với payment: đã POSTED chưa, và số tiền Nợ trên tài khoản nhận tiền */
export type EntrySnapshot = {
  id: number
  status: 'DRAFT' | 'POSTED'
  refType: string
  refId: number
  /** Σ Nợ trên CASH (tiền mặt) hoặc VNPAY_CLEARING (VNPay) */
  receivedAmount: Prisma.Decimal.Value
}

export type CheckItem = {
  kind: ReconciliationKind
  refType: 'PAYMENT' | 'VNPAY'
  refId: number
  paymentId: number | null
  ledgerEntryId: number | null
  transactionId: string | null
  amountExpected: Prisma.Decimal
  amountActual: Prisma.Decimal
  amountDelta: Prisma.Decimal
  detail?: Record<string, unknown>
}

const d = (value: Prisma.Decimal.Value | undefined | null) => new Prisma.Decimal(value ?? 0)

/**
 * Chọn bút toán thuộc về 1 payment: **cùng chi nhánh** và cùng `refId`.
 *
 * `refId` của bút toán thu tiền là id Payment — dải số dùng chung cho mọi chi nhánh, nên một bút
 * toán ở chi nhánh khác trùng `refId` KHÔNG phải bút toán của payment này. Trước đây chỉ so `refId`,
 * nên trên DB mới (id Payment đếm lại từ 1) đối soát ghép bút toán của chi nhánh khác vào và báo
 * `DUPLICATE` cho payment hoàn toàn bình thường.
 *
 * Payment cũ chưa có `branchId` thì vẫn ghép theo `refId` — thà giữ cách cũ còn hơn báo lệch giả
 * hàng loạt cho dữ liệu cũ.
 */
export function selectEntriesForPayment<T extends { branchId: number | null }>(
  payment: { id: number; branchId: number | null },
  entriesByRefId: Map<number, T[]>,
): T[] {
  const rows = entriesByRefId.get(payment.id) ?? []
  return payment.branchId === null ? rows : rows.filter((row) => row.branchId === payment.branchId)
}

/**
 * Phân loại 1 payment dựa trên các bút toán có `refId = payment.id`.
 *
 * - 0 bút toán → MISSING_IN_LEDGER (tiền đã vào, sổ không có)
 * - >1 bút toán → DUPLICATE (ghi 2 lần; bút toán đảo/reversal là entry riêng nên không tính)
 * - 1 bút toán DRAFT → MISSING_IN_LEDGER (đang treo, chưa post = sổ chưa có)
 * - 1 bút toán POSTED nhưng số Nợ ≠ payment.amount → AMOUNT_MISMATCH (delta = actual − expected)
 */
export function classifyPayment(payment: PaymentSnapshot, entries: EntrySnapshot[]): CheckItem {
  const expected = d(payment.amount)
  const base = {
    refType: 'PAYMENT' as const,
    refId: payment.id,
    paymentId: payment.id,
    transactionId: payment.transactionId,
    amountExpected: expected,
  }

  const posted = entries.filter((entry) => entry.status === 'POSTED')
  const drafts = entries.filter((entry) => entry.status === 'DRAFT')

  if (posted.length === 0) {
    return {
      ...base,
      kind: RECONCILIATION_KIND.MISSING_IN_LEDGER,
      ledgerEntryId: drafts[0]?.id ?? null,
      amountActual: new Prisma.Decimal(0),
      amountDelta: expected.negated(),
      detail: drafts.length ? { draftsPending: drafts.length } : { entries: 0 },
    }
  }

  if (posted.length > 1) {
    const actual = posted.reduce((sum, entry) => sum.add(d(entry.receivedAmount)), new Prisma.Decimal(0))
    return {
      ...base,
      kind: RECONCILIATION_KIND.DUPLICATE,
      ledgerEntryId: posted[1].id,
      amountActual: actual,
      amountDelta: actual.minus(expected),
      detail: { entryIds: posted.map((entry) => entry.id) },
    }
  }

  const entry = posted[0]
  const actual = d(entry.receivedAmount)
  const delta = actual.minus(expected)

  if (!delta.isZero()) {
    return {
      ...base,
      kind: RECONCILIATION_KIND.AMOUNT_MISMATCH,
      ledgerEntryId: entry.id,
      amountActual: actual,
      amountDelta: delta,
      detail: { refType: entry.refType },
    }
  }

  return {
    ...base,
    kind: RECONCILIATION_KIND.MATCHED,
    ledgerEntryId: entry.id,
    amountActual: actual,
    amountDelta: new Prisma.Decimal(0),
  }
}

/**
 * So kết quả `querydr` của VNPay với Payment nội bộ.
 * `gateway` để `undefined` khi không gọi được API (chưa cấu hình/chưa có transactionId):
 * khi đó trả null — KHÔNG coi là lệch, cũng KHÔNG coi là khớp; run sẽ ghi nhận số bỏ qua.
 */
export function classifyVnpay(payment: PaymentSnapshot, gateway: { status: string; amount: number } | undefined): CheckItem | null {
  if (!gateway) return null

  const expected = d(payment.amount)
  const actual = d(gateway.amount)
  const base = {
    refType: 'VNPAY' as const,
    refId: payment.id,
    paymentId: payment.id,
    transactionId: payment.transactionId,
    amountExpected: expected,
    amountActual: actual,
  }

  // VNPay: vnp_TransactionStatus = '00' là thành công; Payment nội bộ ở đây đã là SUCCESS
  if (gateway.status !== '00') {
    return {
      ...base,
      kind: RECONCILIATION_KIND.STATUS_MISMATCH,
      ledgerEntryId: null,
      amountDelta: actual.minus(expected),
      detail: { gatewayStatus: gateway.status },
    }
  }

  if (!actual.equals(expected)) {
    return {
      ...base,
      kind: RECONCILIATION_KIND.AMOUNT_MISMATCH,
      ledgerEntryId: null,
      amountDelta: actual.minus(expected),
      detail: { source: 'VNPAY_QUERYDR' },
    }
  }

  return {
    ...base,
    kind: RECONCILIATION_KIND.MATCHED,
    ledgerEntryId: null,
    amountDelta: new Prisma.Decimal(0),
    detail: { source: 'VNPAY_QUERYDR' },
  }
}

/** đếm theo kind + tổng tiền để ghi vào `summary` của run */
export function summarizeItems(items: CheckItem[]) {
  const byKind: Record<string, number> = {}
  let expected = new Prisma.Decimal(0)
  let actual = new Prisma.Decimal(0)
  let absDelta = new Prisma.Decimal(0)

  for (const item of items) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1
    expected = expected.add(item.amountExpected)
    actual = actual.add(item.amountActual)
    absDelta = absDelta.add(item.amountDelta.abs())
  }

  return {
    byKind,
    paymentsChecked: items.length,
    expectedTotal: expected.toFixed(0),
    actualTotal: actual.toFixed(0),
    difference: actual.minus(expected).toFixed(0),
    absDifference: absDelta.toFixed(0),
  }
}
