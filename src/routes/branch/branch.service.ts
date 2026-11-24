import { Injectable, NotFoundException } from '@nestjs/common'
import { BranchRepo } from '@/routes/branch/branch.repo'
import { UpdateBranchSettingsType } from '@/routes/branch/branch.model'
import { toMoneyNumbers } from '@/shared/service/money-serializer'

/**
 * Cấu hình thuế / phí phục vụ của chi nhánh.
 * Chỉ áp cho đơn TẠO MỚI: đơn cũ đã snapshot `taxRate`/`serviceChargeRate` của chính nó.
 */
@Injectable()
export class BranchService {
  constructor(private readonly repo: BranchRepo) {}

  async list() {
    return toMoneyNumbers({ data: await this.repo.list() })
  }

  async updateSettings(id: number, data: UpdateBranchSettingsType) {
    const branch = await this.repo.findById(id)
    if (!branch) throw new NotFoundException(`Không tìm thấy chi nhánh #${id}`)
    return toMoneyNumbers({ data: await this.repo.updateSettings(id, data) })
  }
}
