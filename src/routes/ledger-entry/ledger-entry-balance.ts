import { Prisma } from '@prisma/client'

export type LedgerLineLike = { direction: 'DEBIT' | 'CREDIT'; amount: Prisma.Decimal.Value }

export type LedgerBalance = {
  debitTotal: Prisma.Decimal
  creditTotal: Prisma.Decimal
  /** >= 2 dòng VÀ Σ Nợ = Σ Có */
  balanced: boolean
}

/**
 * 1 bút toán có cân không — dùng cho nhật ký sổ cái (audit).
 * Bút toán 1 dòng hoặc thiếu dòng cũng bị coi là lỗi, dù số học có bằng nhau.
 */
export function summarizeLines(lines: LedgerLineLike[]): LedgerBalance {
  const sum = (direction: 'DEBIT' | 'CREDIT') =>
    lines
      .filter((line) => line.direction === direction)
      .reduce((total, line) => total.add(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0))

  const debitTotal = sum('DEBIT')
  const creditTotal = sum('CREDIT')

  return { debitTotal, creditTotal, balanced: lines.length >= 2 && debitTotal.equals(creditTotal) }
}
