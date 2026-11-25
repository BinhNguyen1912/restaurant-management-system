import { Injectable } from '@nestjs/common'
import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { LedgerEntryRepo, LedgerReconciliationRepo } from '@/routes/ledger-entry/ledger-entry.repo'
import {
  CashBookQueryType,
  LedgerEntryQueryType,
  LedgerReconciliationQueryType,
  SettleVnpayClearingType,
} from '@/routes/ledger-entry/ledger-entry.model'
import { LedgerIntegrityService } from '@/shared/service/ledger-integrity.service'
import { LedgerPostingService } from '@/shared/service/ledger-posting.service'
import { PrismaService } from '@/shared/service/prisma.service'
import { toMoneyNumbers } from '@/shared/service/money-serializer'

/**
 * Nhật ký sổ cái + kiểm tra cân đối.
 *
 * "Sổ có lệch không" trả lời bằng 2 lớp:
 *  - tổng Nợ vs tổng Có của toàn sổ (phải bằng nhau),
 *  - từng bút toán: >= 2 dòng và Σ Nợ = Σ Có (`balanced` trên từng dòng nhật ký).
 *  - cộng thêm 3 phép dò bất thường: DRAFT treo, payment SUCCESS không có bút toán.
 */
@Injectable()
export class LedgerEntryService {
  constructor(
    private readonly repo: LedgerEntryRepo,
    private readonly reconciliationRepo: LedgerReconciliationRepo,
    private readonly integrityService: LedgerIntegrityService,
    private readonly ledgerPosting: LedgerPostingService,
    private readonly prismaService: PrismaService,
  ) {}

  async list(query: LedgerEntryQueryType) {
    return toMoneyNumbers(await this.repo.list(query))
  }

  /**
   * Sổ quỹ: mỗi tài khoản quỹ 4 con số (đầu kỳ / thu / chi / tồn) + dòng tổng.
   * Không truyền kỳ thì lấy tháng hiện tại — đúng câu hỏi "tháng này quỹ còn bao nhiêu".
   */
  async cashBook(query: CashBookQueryType) {
    const today = new Date()
    const fromDate = query.fromDate ?? new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    const toDate = query.toDate ?? today.toISOString().slice(0, 10)

    const accounts = await this.repo.cashBook({ ...query, fromDate, toDate })
    const total = accounts.reduce(
      (acc, account) => ({
        opening: acc.opening + account.opening,
        inflow: acc.inflow + account.inflow,
        outflow: acc.outflow + account.outflow,
        closing: acc.closing + account.closing,
      }),
      { opening: 0, inflow: 0, outflow: 0, closing: 0 },
    )

    return toMoneyNumbers({
      message: 'Success.CashBook',
      data: { fromDate, toDate, branchId: query.branchId ?? null, accounts, total },
    })
  }

  async integrity() {
    const [snapshot, report] = await Promise.all([this.repo.snapshot(), this.integrityService.verify()])
    return toMoneyNumbers({
      ...report,
      ...snapshot,
      checkedAt: new Date(),
    })
  }

  /** Đối soát: tiền đã thu theo phương thức vs số phát sinh trên tài khoản nhận tiền */
  async reconcile(query: LedgerReconciliationQueryType) {
    const report = await this.reconciliationRepo.reconcile(query)
    return toMoneyNumbers({ message: 'Success.Reconcile', ...report })
  }

  /**
   * Đối soát VNPay: ngân hàng báo có bao nhiêu thì chuyển đúng số đó từ tiền chờ về sang BANK.
   * Nợ BANK / Có VNPAY_CLEARING; idempotencyKey theo mã sao kê nên bấm lại không ghi 2 lần.
   */
  async settleVnpayClearing(data: SettleVnpayClearingType) {
    const branchId = data.branchId ?? (await this.resolveDefaultBranchId())
    const amount = new Prisma.Decimal(data.amount)

    // Bấm lại cùng mã sao kê -> trả về bút toán cũ (idempotent), KHÔNG kiểm số dư nữa
    // (vì lần trước đã trừ vào tiền chờ về rồi).
    const idempotencyKey = `vnpay-settle:${data.reference}`
    const existing = await this.prismaService.ledgerEntry.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    })

    const balance = await this.reconciliationRepo.clearingBalance(branchId)
    if (!existing && amount.greaterThan(balance)) {
      throw new BadRequestException(
        `Số tiền chuyển (${amount.toFixed(0)}đ) lớn hơn tiền VNPay đang chờ về (${balance.toFixed(0)}đ)`,
      )
    }

    const entry = await this.ledgerPosting.postEntry({
      branchId,
      refType: 'VNPAY_SETTLEMENT',
      // refId: dùng 0 vì chứng từ là sao kê ngân hàng, không phải payment
      refId: 0,
      idempotencyKey,
      // memo phải TẤT ĐỊNH theo (mã sao kê + số tiền): postEntry hash cả memo nên nếu nhét
      // ghi chú tự do vào đây thì bấm lại cùng giao dịch sẽ bị coi là "nội dung khác" (409).
      memo: `Đối soát VNPay — sao kê ${data.reference}, ${amount.toFixed(0)}đ`,
      lines: [
        { accountCode: 'BANK', direction: 'DEBIT', amount },
        { accountCode: 'VNPAY_CLEARING', direction: 'CREDIT', amount },
      ],
    })

    return {
      message: 'Success.SettleVnpayClearing',
      data: {
        ledgerEntryId: entry.id,
        created: entry.created,
        branchId,
        amount: amount.toNumber(),
        reference: data.reference,
        clearingBalanceAfter: (await this.reconciliationRepo.clearingBalance(branchId)).toNumber(),
      },
    }
  }

  private async resolveDefaultBranchId(): Promise<number> {
    const branch = await this.prismaService.branch.findFirst({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    if (!branch) throw new BadRequestException('Error.BranchNotConfigured')
    return branch.id
  }
}
