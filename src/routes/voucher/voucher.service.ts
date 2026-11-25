import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { VoucherRepo } from '@/routes/voucher/voucher.repo'
import { VoucherBodyType, VoucherQueryType } from '@/routes/voucher/voucher.model'

/** luật hiển thị: "dùng được ngay bây giờ" là tổng hợp của status + thời gian + lượt còn lại */
const isUsableNow = (voucher: {
  status: string
  startAt: Date
  endAt: Date
  usageLimit: number | null
  usedCount: number
}) => {
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

  async create(body: VoucherBodyType, createdById: number) {
    const existing = await this.repo.findByCode(body.code)
    if (existing) throw new ConflictException(`Mã "${body.code.toUpperCase()}" đã tồn tại`)

    const created = await this.repo.create({ ...body, createdById })
    return { message: 'Success.VoucherCreated', data: { ...created, usedCount: created._count.voucherSnapshots } }
  }

  async update(id: number, body: VoucherBodyType, updatedById: number) {
    const current = await this.repo.findById(id)
    if (!current) throw new NotFoundException(`Không tìm thấy voucher #${id}`)

    // đổi mã sang mã của voucher khác -> chặn (mã là duy nhất)
    const duplicated = await this.repo.findByCode(body.code)
    if (duplicated && duplicated.id !== id) {
      throw new ConflictException(`Mã "${body.code.toUpperCase()}" đã tồn tại`)
    }

    // đã có người dùng mà hạ usageLimit xuống dưới số đã dùng -> voucher thành vô nghĩa
    if (body.usageLimit !== null && body.usageLimit !== undefined) {
      const usedCount = current._count.voucherSnapshots
      if (body.usageLimit < usedCount) {
        throw new BadRequestException(`Đã dùng ${usedCount} lượt, không thể đặt giới hạn ${body.usageLimit}`)
      }
    }

    const updated = await this.repo.update(id, { ...body, updatedById })
    return { message: 'Success.VoucherUpdated', data: { ...updated, usedCount: updated._count.voucherSnapshots } }
  }

  async updateStatus(id: number, status: 'ACTIVE' | 'INACTIVE', updatedById: number) {
    const current = await this.repo.findById(id)
    if (!current) throw new NotFoundException(`Không tìm thấy voucher #${id}`)
    const updated = await this.repo.updateStatus(id, status, updatedById)
    return {
      message: 'Success.VoucherStatusUpdated',
      data: { ...updated, usedCount: updated._count.voucherSnapshots, usableNow: false },
    }
  }

  async remove(id: number, deletedById: number) {
    const current = await this.repo.findById(id)
    if (!current) throw new NotFoundException(`Không tìm thấy voucher #${id}`)
    await this.repo.softDelete(id, deletedById)
    return { message: 'Success.VoucherDeleted' }
  }
}
