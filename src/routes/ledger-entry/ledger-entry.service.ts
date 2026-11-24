import { Injectable } from '@nestjs/common'
import { LedgerEntryRepo } from '@/routes/ledger-entry/ledger-entry.repo'
import { LedgerEntryQueryType } from '@/routes/ledger-entry/ledger-entry.model'
import { LedgerIntegrityService } from '@/shared/service/ledger-integrity.service'
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
    private readonly integrityService: LedgerIntegrityService,
  ) {}

  async list(query: LedgerEntryQueryType) {
    return toMoneyNumbers(await this.repo.list(query))
  }

  async integrity() {
    const [snapshot, report] = await Promise.all([this.repo.snapshot(), this.integrityService.verify()])
    return toMoneyNumbers({
      ...report,
      ...snapshot,
      checkedAt: new Date(),
    })
  }
}
