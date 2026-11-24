import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { UpdateBranchSettingsType } from '@/routes/branch/branch.model'

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

  updateSettings(id: number, data: UpdateBranchSettingsType) {
    const patch: Prisma.BranchUpdateInput = {}
    if (data.taxRate !== undefined) patch.taxRate = new Prisma.Decimal(data.taxRate)
    if (data.serviceChargeRate !== undefined) patch.serviceChargeRate = new Prisma.Decimal(data.serviceChargeRate)
    if (data.pricesIncludeTax !== undefined) patch.pricesIncludeTax = data.pricesIncludeTax

    return this.prismaService.branch.update({ where: { id }, data: patch, select: settingsSelect })
  }
}
