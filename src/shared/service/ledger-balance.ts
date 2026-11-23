import { Prisma } from '@prisma/client'

export type LineDirection = 'DEBIT' | 'CREDIT'

export type LedgerLineLike = {
  direction: LineDirection
  amount: Prisma.Decimal.Value
}

export type BalancedTotals = {
  debit: Prisma.Decimal
  credit: Prisma.Decimal
  difference: Prisma.Decimal
}

const ZERO = new Prisma.Decimal(0)
const TWO_PLACES = 2

export class UnbalancedLedgerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnbalancedLedgerError'
  }
}

/**
 * Bất biến của sổ cái kép (ADR 0001 D1): mỗi bút toán phải có Σ Nợ = Σ Có.
 *
 * Từ chối:
 * - bút toán rỗng
 * - số tiền <= 0
 * - số tiền không phải số hợp lệ
 * - tổng Nợ lệch tổng Có (dù chỉ 1 đồng)
 *
 * Mọi phép tính bằng Decimal: `0.1 + 0.2` phải bằng `0.3`, không được là `0.30000000000000004`.
 */
export function checkBalanced(lines: LedgerLineLike[]): BalancedTotals {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new UnbalancedLedgerError('Bút toán phải có ít nhất 1 dòng Nợ/Có')
  }

  for (const line of lines) {
    if (line.direction !== 'DEBIT' && line.direction !== 'CREDIT') {
      throw new UnbalancedLedgerError(`Chiều bút toán không hợp lệ: ${String(line.direction)}`)
    }

    let amount: Prisma.Decimal
    try {
      amount = new Prisma.Decimal(line.amount)
    } catch {
      throw new UnbalancedLedgerError(`Số tiền không hợp lệ: ${String(line.amount)}`)
    }

    if (!amount.isFinite() || !amount.greaterThan(0)) {
      throw new UnbalancedLedgerError(`Số tiền phải lớn hơn 0, nhận được ${amount.toString()}`)
    }
  }

  const debit = sumByDirection(lines, 'DEBIT')
  const credit = sumByDirection(lines, 'CREDIT')
  const difference = debit.minus(credit)

  if (!difference.isZero()) {
    throw new UnbalancedLedgerError(
      `Bút toán không cân: Nợ ${debit.toString()} ≠ Có ${credit.toString()} (lệch ${difference.abs().toString()})`,
    )
  }

  return { debit, credit, difference: ZERO }
}

export function sumByDirection(lines: LedgerLineLike[], direction: LineDirection): Prisma.Decimal {
  return lines
    .filter((line) => line.direction === direction)
    .reduce((total, line) => total.add(new Prisma.Decimal(line.amount)), ZERO)
    .toDecimalPlaces(TWO_PLACES)
}
