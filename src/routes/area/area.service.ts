import { AreaAlreadyExitsException, AreaNotFoundException } from '@/routes/area/area.error'
import { AreaBodyType, AreaQueryType, UpdateAreaBodyType } from '@/routes/area/area.model'
import { AreaRepo } from '@/routes/area/area.repo'
import { isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { resolveBranchId } from '@/shared/service/branch.resolver'
import { AccessTokenPayload } from '@/shared/types/jwt.types'

@Injectable()
export class AreaService {
  constructor(
    private readonly areaRepo: AreaRepo,
    private readonly prismaService: PrismaService,
  ) {}

  private branchIdOf(actor?: { userId?: number; roleName?: string }) {
    return resolveBranchId(this.prismaService, { userId: actor?.userId, roleName: actor?.roleName })
  }

  async create({ createdById, actorRoleName, data }: { data: AreaBodyType; createdById: number; actorRoleName?: string }) {
    try {
      return await this.areaRepo.create({
        ...data,
        createdById,
        actorRoleName,
      })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw AreaAlreadyExitsException
      }
    }
  }
  async getAreaById(areaId: number, actor?: AccessTokenPayload) {
    const area = await this.areaRepo.GetAreaById(areaId, await this.branchIdOf(actor))
    if (!area) throw AreaNotFoundException
    return area
  }

  async UpdateAreaById(areaId: number, { data, updatedById }: { data: UpdateAreaBodyType; updatedById: number }) {
    try {
      return await this.areaRepo.update(areaId, { ...data, updatedById }, await this.branchIdOf({ userId: updatedById }))
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw AreaAlreadyExitsException
      }
      if (isNotFoundPrisma(error)) {
        throw AreaNotFoundException
      }
    }
  }
  async getList(query: AreaQueryType, actor?: AccessTokenPayload) {
    return await this.areaRepo.list(query, await this.branchIdOf(actor))
  }
  async delete({ areaId, deletedById }: { areaId: number; deletedById: number }) {
    return await this.areaRepo.delete({
      areaId,
      deletedById,
      isHard: true,
      branchId: await this.branchIdOf({ userId: deletedById }),
    })
  }
}
