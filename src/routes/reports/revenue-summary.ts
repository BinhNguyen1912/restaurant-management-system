import { Prisma } from '@prisma/client'
import { formatInTimeZone } from 'date-fns-tz'

/**
 * Gộp sổ cái thành bảng tổng hợp ngày × chi nhánh (ticket #09 / ADR 0001 D8).
 *
 * Đầu vào là các DÒNG SỔ CÁI đã POSTED, không phải Order.status — nhờ vậy báo cáo và sổ
 * luôn khớp nhau: sửa công thức doanh thu một chỗ, cả sổ lẫn báo cáo cùng đổi.
 *
 * Ngày được cắt theo timezone của chi nhánh, không theo UTC: đơn 23:30 giờ VN phải nằm
 * trong ngày hôm đó, không phải hôm sau.
 */

export type LedgerRow = {
  branchId: number
  occurredAt: Date
  refType: string
  refId: number
  accountCode: string
  direction: 'DEBIT' | 'CREDIT'
  amount: Prisma.Decimal.Value
}

export type SummaryCell = {
  branchId: number
  /** yyyy-MM-dd theo timezone chi nhánh */
  date: string
  gross: Prisma.Decimal
  discount: Prisma.Decimal
  serviceCharge: Prisma.Decimal
  tip: Prisma.Decimal
  tax: Prisma.Decimal
  net: Prisma.Decimal
  grandTotal: Prisma.Decimal
  cashIn: Prisma.Decimal
  vnpayIn: Prisma.Decimal
  refund: Prisma.Decimal
  cogs: Prisma.Decimal
  rounding: Prisma.Decimal
  orderCount: number
}

const ZERO = new Prisma.Decimal(0)

/** tài khoản nhận tiền theo phương thức thanh toán */
const PAYMENT_ACCOUNT: Record<string, string> = {
  ORDER_PAID_CASH: 'CASH',
  ORDER_PAID_VNPAY: 'VNPAY_CLEARING',
}

const PAYMENT_REF_TYPES = new Set(Object.keys(PAYMENT_ACCOUNT))

const emptyCell = (branchId: number, date: string): SummaryCell => ({
  branchId,
  date,
  gross: ZERO,
  discount: ZERO,
  serviceCharge: ZERO,
  tip: ZERO,
  tax: ZERO,
  net: ZERO,
  grandTotal: ZERO,
  cashIn: ZERO,
  vnpayIn: ZERO,
  refund: ZERO,
  cogs: ZERO,
  rounding: ZERO,
  orderCount: 0,
})

/** +amount cho Có, −amount cho Nợ (tài khoản doanh thu: Nợ = giảm doanh thu, vd hoàn tiền) */
const signed = (direction: 'DEBIT' | 'CREDIT', amount: Prisma.Decimal): Prisma.Decimal =>
  direction === 'CREDIT' ? amount : amount.negated()

/**
 * Cộng dồn các dòng sổ cái thành ô (ngày, chi nhánh).
 *
 * Quy ước từng cột:
 * - `gross` = doanh thu món trước giảm giá = (Σ Có − Σ Nợ) REVENUE_FOOD + giảm giá
 * - `net`   = doanh thu thuần (đã trừ giảm giá và thuế) = doanh thu món + phí phục vụ
 * - `grandTotal` = tiền khách thực trả = net + tip + thuế + chênh lệch làm tròn
 * - `cashIn`/`vnpayIn` = tiền vào theo phương thức, đã trừ phần hoàn lại
 * - `refund` = phần doanh thu đã hoàn (dương)
 */
export function aggregateSummaries(rows: LedgerRow[], timeZone = 'Asia/Ho_Chi_Minh'): SummaryCell[] {
  const cells = new Map<string, SummaryCell>()
  /** đếm đơn duy nhất theo (refType, refId) */
  const orders = new Map<string, Set<string>>()

  for (const row of rows) {
    const date = formatInTimeZone(row.occurredAt, timeZone, 'yyyy-MM-dd')
    const key = `${row.branchId}|${date}`
    let cell = cells.get(key)
    if (!cell) {
      cell = emptyCell(row.branchId, date)
      cells.set(key, cell)
    }

    const amount = new Prisma.Decimal(row.amount)
    if (amount.isZero()) continue

    const isRefund = row.refType === 'REFUND'

    switch (row.accountCode) {
      case 'REVENUE_FOOD':
        cell.net = cell.net.add(signed(row.direction, amount))
        if (isRefund && row.direction === 'DEBIT') cell.refund = cell.refund.add(amount)
        break
      case 'DISCOUNT':
        // giảm giá là tài khoản contra-revenue: Nợ = tăng giảm giá, Có = hoàn lại giảm giá
        cell.discount = cell.discount.add(row.direction === 'DEBIT' ? amount : amount.negated())
        break
      case 'SERVICE_CHARGE':
        cell.serviceCharge = cell.serviceCharge.add(signed(row.direction, amount))
        cell.net = cell.net.add(signed(row.direction, amount))
        break
      case 'TAX_PAYABLE':
        cell.tax = cell.tax.add(signed(row.direction, amount))
        break
      case 'TIP_PAYABLE':
        cell.tip = cell.tip.add(signed(row.direction, amount))
        break
      case 'ROUNDING_ADJUSTMENT':
        cell.rounding = cell.rounding.add(signed(row.direction, amount))
        break
      case 'COGS':
        // COGS là tài khoản CHI PHÍ: Nợ = tăng giá vốn (ngược với tài khoản doanh thu)
        cell.cogs = cell.cogs.add(row.direction === 'DEBIT' ? amount : amount.negated())
        break
      default:
        break
    }

    // tiền vào theo phương thức: chỉ tính dòng của bút toán thu tiền / hoàn tiền
    if (row.accountCode === 'CASH' || row.accountCode === 'VNPAY_CLEARING') {
      const inflow = row.direction === 'DEBIT' ? amount : amount.negated()
      const isPaymentEntry = PAYMENT_REF_TYPES.has(row.refType) || isRefund
      if (isPaymentEntry) {
        if (row.accountCode === 'CASH') cell.cashIn = cell.cashIn.add(inflow)
        else cell.vnpayIn = cell.vnpayIn.add(inflow)
      }
    }

    if (PAYMENT_REF_TYPES.has(row.refType)) {
      const orderKey = `${row.branchId}|${date}`
      const set = orders.get(orderKey) ?? new Set<string>()
      set.add(`${row.refType}:${row.refId}`)
      orders.set(orderKey, set)
    }
  }

  for (const [key, cell] of cells) {
    // gross: doanh thu món (đã trừ giảm giá) + giảm giá = tiền món ban đầu
    cell.gross = cell.net.minus(cell.serviceCharge).add(cell.discount)
    cell.grandTotal = cell.net.add(cell.tip).add(cell.tax).add(cell.rounding)
    cell.orderCount = orders.get(key)?.size ?? 0
  }

  return [...cells.values()].sort((a, b) => (a.date === b.date ? a.branchId - b.branchId : a.date.localeCompare(b.date)))
}

/**
 * Chuẩn hoá input ngày về `yyyy-MM-dd`.
 * Nhận cả 'yyyy-MM-dd' lẫn ISO đầy đủ ('2026-03-02T00:00:00.000+07:00') — dashboard và FE
 * gửi ISO, báo cáo gửi ngày trơn; cả hai phải về cùng một khoảng.
 */
export function toDay(value?: string | null): string | undefined {
  if (!value) return undefined
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return match?.[1]
}

/** ngày local (yyyy-MM-dd) từ chuỗi query hoặc hôm nay */
export function resolveRange(fromDate?: string, toDate?: string, timeZone = 'Asia/Ho_Chi_Minh') {
  const today = formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd')
  const to = toDay(toDate) || toDay(fromDate) || today
  const from = toDay(fromDate) || to
  const offset = timeZone === 'Asia/Ho_Chi_Minh' ? '+07:00' : 'Z'
  return {
    from,
    to,
    /** biên ngày theo local (VN = UTC+7): 00:00 ngày đầu → 23:59:59.999 ngày cuối */
    gte: new Date(`${from}T00:00:00.000${offset}`),
    lte: new Date(`${to}T23:59:59.999${offset}`),
  }
}
