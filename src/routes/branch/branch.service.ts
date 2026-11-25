import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { BranchRepo } from '@/routes/branch/branch.repo'
import { BranchBodyType, UpdateBranchBodyType, UpdateBranchSettingsType } from '@/routes/branch/branch.model'
import { isUniqueConstraintPrisma } from '@/shared/helper'
import { toMoneyNumbers } from '@/shared/service/money-serializer'

/**
 * Cấu hình thuế / phí phục vụ của chi nhánh.
 * Chỉ áp cho đơn TẠO MỚI: đơn cũ đã snapshot `taxRate`/`serviceChargeRate` của chính nó.
 */
@Injectable()
export class BranchService {
  constructor(private readonly repo: BranchRepo) {}

  async list() {
    const branches = await this.repo.list()
    // kèm số nhân viên/bàn để màn hình quản lý biết chi nhánh nào đang được dùng
    const withUsage = await Promise.all(
      branches.map(async (branch) => ({ ...branch, usage: await this.repo.usage(branch.id) })),
    )
    return toMoneyNumbers({ data: withUsage })
  }

  async create(body: BranchBodyType) {
    try {
      return toMoneyNumbers({ data: await this.repo.create(body) })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) throw new ConflictException('Error.BranchCodeExists')
      throw error
    }
  }

  async update(id: number, body: UpdateBranchBodyType) {
    const branch = await this.repo.findById(id)
    if (!branch) throw new NotFoundException('Error.BranchNotFound')
    try {
      return toMoneyNumbers({ data: await this.repo.update(id, body) })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) throw new ConflictException('Error.BranchCodeExists')
      throw error
    }
  }

  async updateSettings(id: number, data: UpdateBranchSettingsType) {
    const branch = await this.repo.findById(id)
    if (!branch) throw new NotFoundException(`Không tìm thấy chi nhánh #${id}`)
    return toMoneyNumbers({ data: await this.repo.updateSettings(id, data) })
  }
}
