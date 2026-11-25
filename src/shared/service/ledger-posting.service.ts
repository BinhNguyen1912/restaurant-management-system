import { createHash } from 'node:crypto'
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@/shared/service/prisma.service'
import { computeDepositSettlementAmount } from '@/shared/service/deposit-settlement'
import { checkBalanced, LedgerLineLike } from '@/shared/service/ledger-balance'

export type PostLedgerLineInput = {
  /** mã tài khoản trong danh mục (CASH, REVENUE_FOOD, ...) */
  accountCode: string
  direction: 'DEBIT' | 'CREDIT'
  amount: Prisma.Decimal.Value
  orderId?: number | null
  paymentId?: number | null
}

export type LedgerRefType =
  | 'ORDER_PAID_CASH'
  | 'ORDER_PAID_VNPAY'
  | 'RESERVATION_DEPOSIT'
  | 'DEPOSIT_SETTLED'
  | 'REFUND'
  | 'REVERSAL'
  | 'CASH_VARIANCE'
  | 'VNPAY_SETTLEMENT'
  | 'ORDER_COGS'

export type PostEntryInput = {
  branchId: number
  refType: LedgerRefType
  refId: number
  /** khoá chống ghi trùng — cùng 1 sự kiện chỉ có 1 bút toán */
  idempotencyKey: string
  occurredAt?: Date
  memo?: string
  currency?: string
  reversalOfId?: number | null
  lines: PostLedgerLineInput[]
}

export type PostEntryResult = {
  id: number
  created: boolean
}

type LedgerClient = {
  ledgerAccount: { findMany: (args: any) => Promise<{ id: number; code: string; isActive: boolean; currency: string }[]> }
  ledgerEntry: {
    findUnique: (args: any) => Promise<{ id: number; requestHash: string; status: string } | null>
    createMany: (args: any) => Promise<{ count: number }>
    updateMany: (args: any) => Promise<{ count: number }>
  }
  ledgerLine: { createMany: (args: any) => Promise<{ count: number }> }
}

const MAX_KEY_LENGTH = 160
const MAX_MEMO_LENGTH = 500

/** JSON ổn định (khoá sắp xếp) để hash không đổi khi thứ tự key đổi */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`
}

/**
 * Hash nội dung bút toán: cùng `idempotencyKey` mà nội dung khác nghĩa là có bug
 * (gọi lại với số tiền khác) — phải báo xung đột, tuyệt đối không ghi đè.
 */
export function hashEntryInput(input: PostEntryInput): string {
  const canonical = {
    branchId: input.branchId,
    refType: input.refType,
    refId: input.refId,
    idempotencyKey: input.idempotencyKey,
    occurredAt: (input.occurredAt ?? new Date(0)).toISOString(),
    currency: input.currency ?? 'VND',
    memo: input.memo ?? null,
    reversalOfId: input.reversalOfId ?? null,
    lines: input.lines.map((line) => ({
      accountCode: line.accountCode,
      direction: line.direction,
      // số tiền luôn chuẩn hoá 2 chữ số để "1000" và "1000.00" ra cùng hash
      amount: new Prisma.Decimal(line.amount).toDecimalPlaces(2).toFixed(2),
      orderId: line.orderId ?? null,
      paymentId: line.paymentId ?? null,
    })),
  }
  return createHash('sha256').update(stableStringify(canonical)).digest('hex')
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'

/**
 * Lõi sổ cái ghi kép (ADR 0001 D1/D2/D3), theo mẫu module `double-entry` của trustwow-backend:
 *
 * 1. `assertInput`: VND, eventKey hợp lệ, ≥2 dòng, tiền > 0, **Σ Nợ = Σ Có** — chặn TRƯỚC khi chạm DB.
 * 2. `requestHash`: cùng eventKey mà nội dung khác => xung đột (không ghi đè, không nuốt).
 * 3. Ghi DRAFT trước (giữ chỗ eventKey, chống 2 request cùng lúc), rồi mới POSTED.
 * 4. Replay (cùng key, cùng hash, đã POSTED) => trả entry cũ, `created: false`.
 *
 * Không có controller: client không bao giờ ghi sổ trực tiếp.
 */
@Injectable()
export class LedgerPostingService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Tất toán tiền cọc của 1 reservation khi khách trả nốt (ticket #07).
   *
   * Nợ DEPOSIT_LIABILITY / Có REVENUE_FOOD — cọc không phải doanh thu lúc nhận, chỉ thành
   * doanh thu khi dùng để trả hoá đơn. Idempotent theo reservation: bấm lại/gọi 2 lần chỉ 1 bút toán.
   */
  async settleReservationDeposit(
    input: { reservationId: number; grandTotal: Prisma.Decimal.Value; branchId?: number | null; orderId?: number | null },
    tx?: Prisma.TransactionClient,
  ): Promise<PostEntryResult | null> {
    const client = (tx ?? this.prismaService) as unknown as {
      reservation: { findUnique: (args: any) => Promise<{ depositAmount: number | null; branchId: number } | null> }
    }
    const reservation = await client.reservation.findUnique({
      where: { id: input.reservationId },
      select: { depositAmount: true, branchId: true },
    })
    if (!reservation) return null

    const amount = computeDepositSettlementAmount(reservation.depositAmount, input.grandTotal)
    if (amount.lessThanOrEqualTo(0)) return null

    return this.postEntry(
      {
        branchId: input.branchId ?? reservation.branchId,
        refType: 'DEPOSIT_SETTLED',
        refId: input.reservationId,
        idempotencyKey: `deposit-settled:reservation:${input.reservationId}`,
        memo: `Tất toán cọc reservation #${input.reservationId}`,
        lines: [
          { accountCode: 'DEPOSIT_LIABILITY', direction: 'DEBIT', amount, orderId: input.orderId ?? null },
          { accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount, orderId: input.orderId ?? null },
        ],
      },
      tx,
    )
  }

  async postEntry(input: PostEntryInput, tx?: Prisma.TransactionClient): Promise<PostEntryResult> {
    this.assertInput(input)

    // Không có transaction từ nghiệp vụ -> tự mở transaction: bước DRAFT không bao giờ lộ ra ngoài,
    // và request thứ 2 sẽ bị chặn ở unique index cho tới khi request đầu commit.
    if (!tx) {
      return this.prismaService.$transaction((inner) => this.postEntry(input, inner))
    }

    const requestHash = hashEntryInput(input)
    const client = (tx ?? this.prismaService) as unknown as LedgerClient

    // Replay: đã có bút toán cho eventKey này
    const existing = await client.ledgerEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, requestHash: true, status: true },
    })
    if (existing) return this.replay(existing, requestHash)

    // Danh mục tài khoản: phải tồn tại, đang dùng, đúng tiền tệ
    const currency = input.currency ?? 'VND'
    const codes = Array.from(new Set(input.lines.map((line) => line.accountCode)))
    const accounts = await client.ledgerAccount.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, isActive: true, currency: true },
    })
    const accountByCode = new Map(accounts.map((account) => [account.code, account]))

    for (const code of codes) {
      const account = accountByCode.get(code)
      if (!account || !account.isActive || account.currency !== currency) {
        throw new BadRequestException(`Tài khoản kế toán không dùng được: ${code}`)
      }
    }

    // Giữ chỗ eventKey trước khi ghi dòng: 2 request song song chỉ 1 thắng
    const claimed = await client.ledgerEntry.createMany({
      data: [
        {
          branchId: input.branchId,
          occurredAt: input.occurredAt ?? new Date(),
          refType: input.refType,
          refId: input.refId,
          memo: input.memo ?? null,
          currency,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          status: 'DRAFT',
          reversalOfId: input.reversalOfId ?? null,
        },
      ],
      skipDuplicates: true,
    })

    if (claimed.count === 0) {
      const winner = await client.ledgerEntry.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, requestHash: true, status: true },
      })
      if (!winner) throw new ConflictException('Không giữ được eventKey cho bút toán')
      return this.replay(winner, requestHash)
    }

    const entry = await client.ledgerEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, requestHash: true, status: true },
    })
    if (!entry) throw new ConflictException('Không tìm thấy bút toán vừa tạo')

    await client.ledgerLine.createMany({
      data: input.lines.map((line) => ({
        entryId: entry.id,
        accountId: accountByCode.get(line.accountCode)!.id,
        direction: line.direction,
        amount: new Prisma.Decimal(line.amount).toDecimalPlaces(2),
        currency,
        orderId: line.orderId ?? null,
        paymentId: line.paymentId ?? null,
      })),
    })

    const posted = await client.ledgerEntry.updateMany({
      where: { id: entry.id, status: 'DRAFT' },
      data: { status: 'POSTED', postedAt: new Date() },
    })
    if (posted.count !== 1) throw new ConflictException('Bút toán đã bị thay đổi trong lúc ghi')

    return { id: entry.id, created: true }
  }

  private replay(
    entry: { id: number; requestHash: string; status: string },
    requestHash: string,
  ): PostEntryResult {
    if (entry.status !== 'POSTED' || entry.requestHash !== requestHash) {
      throw new ConflictException(
        `Bút toán ${entry.id}: eventKey đã dùng cho nội dung khác (hoặc chưa POSTED). Không ghi đè.`,
      )
    }
    return { id: entry.id, created: false }
  }

  private assertInput(input: PostEntryInput): void {
    const currency = input.currency ?? 'VND'

    if (
      currency !== 'VND' ||
      !input.idempotencyKey?.trim() ||
      input.idempotencyKey.length > MAX_KEY_LENGTH ||
      (input.memo && input.memo.length > MAX_MEMO_LENGTH) ||
      !Number.isInteger(input.branchId) ||
      !Number.isInteger(input.refId) ||
      (input.occurredAt && Number.isNaN(input.occurredAt.getTime())) ||
      input.lines.length < 2
    ) {
      throw new BadRequestException('Bút toán không hợp lệ: thiếu eventKey/chi nhánh/chứng từ hoặc ít hơn 2 dòng')
    }

    // Bất biến Σ Nợ = Σ Có + tiền > 0 (ném lỗi trước khi chạm DB)
    checkBalanced(input.lines as LedgerLineLike[])
  }
}

export { isUniqueViolation as isLedgerUniqueViolation }
