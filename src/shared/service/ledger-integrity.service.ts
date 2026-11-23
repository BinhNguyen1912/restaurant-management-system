import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'

export type LedgerIntegrityReport = {
  ok: boolean
  /** bút toán có ít hơn 2 dòng, hoặc Σ Nợ ≠ Σ Có */
  unbalancedEntries: number
  /** bút toán DRAFT treo quá 5 phút (ghi dở) */
  staleDrafts: number
  /** payment đã SUCCESS nhưng chưa có bút toán nào */
  paidPaymentsWithoutEntry: number
}

const STALE_DRAFT_MINUTES = 5

/**
 * Kiểm tra toàn vẹn sổ cái — dùng cho cảnh báo hằng ngày (ADR 0001 D7).
 *
 * Cùng ý tưởng với `finance-integrity.service` của trustwow-backend: không tin "đã ghi đúng",
 * mà đếm lại từ DB những bất thường đã biết.
 */
@Injectable()
export class LedgerIntegrityService {
  constructor(private readonly prismaService: PrismaService) {}

  async verify(): Promise<LedgerIntegrityReport> {
    const [unbalanced] = await this.prismaService.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM (
        SELECT e.id
        FROM "LedgerEntry" e
        LEFT JOIN "LedgerLine" l ON l."entryId" = e.id
        GROUP BY e.id
        HAVING count(l.id) < 2
            OR SUM(CASE WHEN l.direction = 'DEBIT' THEN l.amount ELSE 0 END)
               <> SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE 0 END)
      ) AS broken
    `

    const [staleDrafts] = await this.prismaService.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM "LedgerEntry"
      WHERE status = 'DRAFT'
        AND "createdAt" < now() - (${STALE_DRAFT_MINUTES} * interval '1 minute')
    `

    const [missingEntries] = await this.prismaService.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM "Payment" p
      WHERE p.status = 'SUCCESS'
        AND NOT EXISTS (
          SELECT 1 FROM "LedgerEntry" e
          WHERE e."refId" = p.id
            AND e."refType" IN ('ORDER_PAID_CASH', 'ORDER_PAID_VNPAY', 'RESERVATION_DEPOSIT')
            AND e.status = 'POSTED'
        )
    `

    const report: LedgerIntegrityReport = {
      ok: false,
      unbalancedEntries: Number(unbalanced?.count ?? 0),
      staleDrafts: Number(staleDrafts?.count ?? 0),
      paidPaymentsWithoutEntry: Number(missingEntries?.count ?? 0),
    }

    return {
      ...report,
      ok: report.unbalancedEntries === 0 && report.staleDrafts === 0 && report.paidPaymentsWithoutEntry === 0,
    }
  }
}
