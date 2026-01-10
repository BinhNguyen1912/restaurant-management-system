import { AreaAlreadyExitsException, AreaNotFoundException } from '@/routes/area/area.error'
import { AreaBodyType, AreaQueryType, UpdateAreaBodyType } from '@/routes/area/area.model'
import { AreaRepo } from '@/routes/area/area.repo'
import { isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { Injectable } from '@nestjs/common'

@Injectable()
export class AreaService {
  constructor(private readonly areaRepo: AreaRepo) {}

  async create({ createdById, data }: { data: AreaBodyType; createdById: number }) {
    try {
      return await this.areaRepo.create({
        ...data,
        createdById,
      })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw AreaAlreadyExitsException
      }
    }
  }
  async getAreaById(areaId: number) {
    const area = await this.areaRepo.GetAreaById(areaId)
    if (!area) throw AreaNotFoundException
    return area
  }

  async UpdateAreaById(areaId: number, { data, updatedById }: { data: UpdateAreaBodyType; updatedById: number }) {
    try {
      return await this.areaRepo.update(areaId, { ...data, updatedById })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw AreaAlreadyExitsException
      }
      if (isNotFoundPrisma(error)) {
        throw AreaNotFoundException
      }
    }
  }
  async getList(query: AreaQueryType) {
    return await this.areaRepo.list(query)
  }
  async delete({ areaId, deletedById }: { areaId: number; deletedById: number }) {
    return await this.areaRepo.delete({ areaId, deletedById, isHard: true })
  }
}
