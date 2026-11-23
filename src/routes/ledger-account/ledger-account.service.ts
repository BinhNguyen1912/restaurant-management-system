import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { LedgerAccountRepo } from '@/routes/ledger-account/ledger-account.repo'
import {
  CreateLedgerAccountType,
  LedgerAccountQueryType,
  UpdateLedgerAccountType,
} from '@/routes/ledger-account/ledger-account.model'

/**
 * Danh mục tài khoản kế toán.
 *
 * Quy tắc (chốt với chủ dự án 2026-11-23):
 * - Tài khoản hệ thống (`isSystem`): code được code tham chiếu trực tiếp -> CẤM đổi code/type,
 *   CẤM tắt, CẤM xoá. Chỉ đổi được `name` hiển thị.
 * - Tài khoản chi tiết (tự tạo): đổi được name/type/tắt, xoá được nếu CHƯA có bút toán nào.
 * - `code` bất biến với mọi tài khoản vì báo cáo gom theo code.
 */
@Injectable()
export class LedgerAccountService {
  constructor(private readonly ledgerAccountRepo: LedgerAccountRepo) {}

  async list(query: LedgerAccountQueryType) {
    const data = await this.ledgerAccountRepo.list(query)
    return {
      message: 'Success.GetLedgerAccounts',
      data,
    }
  }

  async create(data: CreateLedgerAccountType) {
    const existing = await this.ledgerAccountRepo.findByCode(data.code)
    if (existing) {
      throw new BadRequestException(`Mã tài khoản "${data.code}" đã tồn tại`)
    }

    const account = await this.ledgerAccountRepo.create(data)
    return { message: 'Success.CreateLedgerAccount', data: account }
  }

  async update(id: number, data: UpdateLedgerAccountType) {
    const account = await this.ledgerAccountRepo.findById(id)
    if (!account) throw new NotFoundException(`Không tìm thấy tài khoản #${id}`)

    if (account.isSystem) {
      if (data.type && data.type !== account.type) {
        throw new BadRequestException(
          `"${account.code}" là tài khoản hệ thống: không đổi được loại (code đang được dùng trong bút toán tự động)`,
        )
      }
      if (data.isActive === false) {
        throw new BadRequestException(`"${account.code}" là tài khoản hệ thống: không tắt được vì luồng thu tiền cần nó`)
      }
    }

    const updated = await this.ledgerAccountRepo.update(id, { name: data.name, type: data.type, isActive: data.isActive })
    return { message: 'Success.UpdateLedgerAccount', data: updated }
  }

  async delete(id: number) {
    const account = await this.ledgerAccountRepo.findById(id)
    if (!account) throw new NotFoundException(`Không tìm thấy tài khoản #${id}`)

    if (account.isSystem) {
      throw new BadRequestException(`"${account.code}" là tài khoản hệ thống: không xoá được`)
    }

    const lineCount = await this.ledgerAccountRepo.countLines(id)
    if (lineCount > 0) {
      throw new BadRequestException(
        `Tài khoản đã có ${lineCount} dòng bút toán: không xoá được. Hãy tắt (isActive = false) thay vì xoá.`,
      )
    }

    await this.ledgerAccountRepo.delete(id)
    return { message: 'Success.DeleteLedgerAccount', data: { id } }
  }
}
