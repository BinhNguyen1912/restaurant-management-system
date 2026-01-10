import { UnitAlreadyExitsException } from '@/routes/unit/unit.error'
import { unitBodyType, unitParamsType, unitUpdateBodyType } from '@/routes/unit/unit.model'
import { UnitRepo } from '@/routes/unit/unit.repo'
import { isUniqueConstraintPrisma } from '@/shared/helper'
import { Injectable } from '@nestjs/common'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

@Injectable()
export class UnitService {
  constructor(private readonly unitRepo: UnitRepo) {}

  async create(data: unitBodyType, userId: number) {
    try {
      return await this.unitRepo.create(data, userId)
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw UnitAlreadyExitsException
      }
      if (error instanceof PrismaClientKnownRequestError) {
        throw UnitAlreadyExitsException
      }
      throw error
    }
  }
  async findAll() {
    return await this.unitRepo.getList()
  }

  async update({ name }: unitParamsType, data: unitUpdateBodyType, userId: number) {
    try {
      return await this.unitRepo.update({ name, data, userId })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw UnitAlreadyExitsException
      }
      throw error
    }
  }

  async delete({ name }: unitParamsType, userId: number) {
    return await this.unitRepo.delete({ name, isHard: true, userId })
  }
}
