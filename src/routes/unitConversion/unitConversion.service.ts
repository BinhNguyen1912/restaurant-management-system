import { UnitAlreadyExitsException } from '@/routes/unit/unit.error'
import { UnitConversionNotFoundException } from '@/routes/unitConversion/unitConversion.error'
import {
  unitConversionBodyType,
  unitConversionParamsType,
  unitConversionUpdateBodyType,
} from '@/routes/unitConversion/unitConversion.model'
import { UnitConversionRepo } from '@/routes/unitConversion/unitConversion.repo'
import { isForeignKeyPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { Injectable } from '@nestjs/common'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

@Injectable()
export class UnitConversionService {
  constructor(private readonly unitConversionRepo: UnitConversionRepo) {}

  async create(data: unitConversionBodyType, userId: number) {
    try {
      return await this.unitConversionRepo.create(data, userId)
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw UnitAlreadyExitsException
      }
      if (isForeignKeyPrisma(error)) {
        throw UnitConversionNotFoundException
      }
      if (error instanceof PrismaClientKnownRequestError) {
        throw UnitAlreadyExitsException
      }
      throw error
    }
  }
  async findAll() {
    return await this.unitConversionRepo.getList()
  }

  async update({ id }: unitConversionParamsType, data: unitConversionUpdateBodyType, userId: number) {
    try {
      return await this.unitConversionRepo.update({ id, data, userId })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw UnitAlreadyExitsException
      }
      throw error
    }
  }

  async delete({ id }: unitConversionParamsType, userId: number) {
    return await this.unitConversionRepo.delete({ id, isHard: true, userId })
  }
}
