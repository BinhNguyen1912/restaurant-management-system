import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { VoucherRepo } from '@/routes/voucher/voucher.repo'
import { VoucherBodyType, VoucherQueryType } from '@/routes/voucher/voucher.model'
import { isUniqueConstraintPrisma } from '@/shared/helper'

type VoucherRow = {
  status: string
  startAt: Date
  endAt: Date
  usageLimit: number | null
  usedCount: number
}

/** luật hiển thị: "dùng được ngay bây giờ" là tổng hợp của status + thời gian + lượt còn lại */
const isUsableNow = (voucher: VoucherRow) => {
  const now = new Date()
  if (voucher.status !== 'ACTIVE') return false
  if (now < voucher.startAt || now > voucher.endAt) return false
  if (voucher.usageLimit !== null && voucher.usedCount >= voucher.usageLimit) return false
  return true
}

/** gắn `usedCount` (số snapshot) vào row để phần còn lại của code chỉ nói về 1 hình dạng dữ liệu */
const withUsage = <T extends { _count: { voucherSnapshots: number } }>(row: T) => ({
  ...row,
  usedCount: row._count.voucherSnapshots,
})

@Injectable()
export class VoucherService {
  constructor(private readonly repo: VoucherRepo) {}

  async list(query: VoucherQueryType) {
    const { rows, totalItems } = await this.repo.list(query)
    return {
      message: 'Success.Vouchers',
      data: rows.map((row) => ({ ...row, usableNow: isUsableNow(withUsage(row)) })),
      totalItems,
      page: query.page,
      limit: query.limit,
    }
  }

  async detail(id: number) {
    const voucher = await this.repo.findById(id)
    if (!voucher) throw new NotFoundException(`Không tìm thấy voucher #${id}`)
    const data = withUsage(voucher)
    return { message: 'Success.Voucher', data: { ...data, usableNow: isUsableNow(data) } }
  }

  /**
   * Mã là unique ở DB, kể cả row đã xoá mềm -> kiểm cả mã đã xoá để trả 409 kèm lý do
   * thay vì để Prisma ném P2002 thành 500.
   */
  private async assertCodeAvailable(code: string, ignoreId?: number) {
    const normalized = code.trim().toUpperCase()
    const existing = await this.repo.findAnyByCode(normalized)
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException(
        existing.deletedAt
          ? `Mã "${normalized}" đã dùng cho một mã đã xoá — chọn mã khác`
          : `Mã "${normalized}" đã tồn tại`,
      )
    }
  }

  /** hai request tạo cùng mã một lúc: DB chặn, nhưng phải là 409 chứ không phải 500 */
  private async guardUnique<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action()
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) throw new ConflictException('Error.VoucherCodeAlreadyExists')
      throw error
    }
  }

  async create(body: VoucherBodyType, createdById: number) {
    await this.assertCodeAvailable(body.code)
    const created = await this.guardUnique(() => this.repo.create({ ...body, createdById }))
    const data = withUsage(created)
    return { message: 'Success.VoucherCreated', data: { ...data, usableNow: isUsableNow(data) } }
  }

  async update(id: number, body: VoucherBodyType, updatedById: number) {
    const current = await this.repo.findById(id)
    if (!current) throw new NotFoundException(`Không tìm thấy voucher #${id}`)

    await this.assertCodeAvailable(body.code, id)

    // đã có người dùng mà hạ usageLimit xuống dưới số đã dùng -> voucher thành vô nghĩa
    if (body.usageLimit !== null && body.usageLimit !== undefined) {
      const usedCount = current._count.voucherSnapshots
      if (body.usageLimit < usedCount) {
        throw new BadRequestException(`Đã dùng ${usedCount} lượt, không thể đặt giới hạn ${body.usageLimit}`)
      }
    }

    const updated = await this.guardUnique(() => this.repo.update(id, { ...body, updatedById }))
    const data = withUsage(updated)
    return { message: 'Success.VoucherUpdated', data: { ...data, usableNow: isUsableNow(data) } }
  }

  async updateStatus(id: number, status: 'ACTIVE' | 'INACTIVE', updatedById: number) {
    const current = await this.repo.findById(id)
    if (!current) throw new NotFoundException(`Không tìm thấy voucher #${id}`)
    const updated = await this.repo.updateStatus(id, status, updatedById)
    const data = withUsage(updated)
    return {
      message: 'Success.VoucherStatusUpdated',
      data: { ...data, usableNow: isUsableNow(data) },
    }
  }

  async remove(id: number, deletedById: number) {
    const current = await this.repo.findById(id)
    if (!current) throw new NotFoundException(`Không tìm thấy voucher #${id}`)
    await this.repo.softDelete(id, deletedById)
    return { message: 'Success.VoucherDeleted' }
  }
}
