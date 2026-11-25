import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { BranchBodyType, UpdateBranchBodyType, UpdateBranchSettingsType } from '@/routes/branch/branch.model'

const settingsSelect = {
  id: true,
  code: true,
  name: true,
  isActive: true,
  taxRate: true,
  serviceChargeRate: true,
  pricesIncludeTax: true,
} as const

@Injectable()
export class BranchRepo {
  constructor(private readonly prismaService: PrismaService) {}

  list() {
    return this.prismaService.branch.findMany({ select: settingsSelect, orderBy: { id: 'asc' } })
  }

  findById(id: number) {
    return this.prismaService.branch.findUnique({ where: { id }, select: settingsSelect })
  }

  /** Tạo chi nhánh; ném lỗi Prisma P2002 khi `code` trùng (service đổi thành 409) */
  create(data: BranchBodyType) {
    return this.prismaService.branch.create({
      data: {
        code: data.code,
        name: data.name,
        address: data.address ?? '',
        timezone: data.timezone ?? 'Asia/Ho_Chi_Minh',
        isActive: data.isActive ?? true,
      },
      select: settingsSelect,
    })
  }

  update(id: number, data: UpdateBranchBodyType) {
    return this.prismaService.branch.update({
      where: { id },
      data,
      select: settingsSelect,
    })
  }

  /** Đếm nhân viên + bàn của chi nhánh để UI cảnh báo trước khi cho ngừng hoạt động */
  async usage(id: number) {
    const [users, tables, orders] = await Promise.all([
      this.prismaService.user.count({ where: { branchId: id, deletedAt: null } }),
      this.prismaService.tableNode.count({ where: { branchId: id } }).catch(() => 0),
      this.prismaService.order.count({ where: { branchId: id } }).catch(() => 0),
    ])
    return { users, tables, orders }
  }

  updateSettings(id: number, data: UpdateBranchSettingsType) {
    const patch: Prisma.BranchUpdateInput = {}
    if (data.taxRate !== undefined) patch.taxRate = new Prisma.Decimal(data.taxRate)
    if (data.serviceChargeRate !== undefined) patch.serviceChargeRate = new Prisma.Decimal(data.serviceChargeRate)
    if (data.pricesIncludeTax !== undefined) patch.pricesIncludeTax = data.pricesIncludeTax

    return this.prismaService.branch.update({ where: { id }, data: patch, select: settingsSelect })
  }
}
