import { BadRequestException, Injectable } from '@nestjs/common'

import { isForeignKeyPrisma, isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import {
  CreateIngredientBodyType,
  IngredientQueryType,
  UpdateIngredientBodyType,
} from '@/routes/ingredients/ingredient.model'
import { IngredientRepo } from '@/routes/ingredients/ingredient.repo'
import {
  IngredientAlreadyExitsException,
  IngredientNotFoundException,
  UnitNotFoundException,
} from '@/routes/ingredients/ingredient.error'
import { UpdateIngredientBodyDTO } from '@/routes/ingredients/ingredient.dtos'
import { MessageResType } from '@/shared/models/respone.model'
import { CACHE_KEYS } from '@/cache/cache.constant'
import { RedisService } from '@/shared/service/redis.service'
import { CacheService } from '@/cache/services/cache.service'
import { IngredientCacheType } from '@/cache/types/ingredient.type'

@Injectable()
export class IngredientService {
  constructor(
    private readonly ingredientRepo: IngredientRepo,
    private readonly cacheService: CacheService,
    private readonly redisService: RedisService,
  ) {}

  async create({ body, createdById }: { body: CreateIngredientBodyType; createdById: number }) {
    try {
      const result = await this.ingredientRepo.create({ body, createdById })
      const ingredientKey = CACHE_KEYS.INGREDIENT(result.id)
      await this.redisService.setHash(ingredientKey, {
        stock: result.stock,
        minStock: result.minStock || 0,
        unitId: result.unitId,
        name: result.name,
      })

      return result
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw IngredientAlreadyExitsException
      }
      if (isForeignKeyPrisma(error)) {
        throw UnitNotFoundException
      }
      throw error
    }
  }
  async findUnique(id: number) {
    const ingredient = await this.ingredientRepo.findUnique(id)
    if (!ingredient) throw IngredientNotFoundException
    return ingredient
  }

  async update({ data, id, updatedById }: { id: number; data: UpdateIngredientBodyType; updatedById: number }) {
    try {
      const result = await this.ingredientRepo.update({ data, id, updatedById })
      const ingredientKey = CACHE_KEYS.INGREDIENT(result.id)
      await this.cacheService.del(ingredientKey)

      await this.redisService.setHash(ingredientKey, {
        stock: result.stock,
        minStock: result.minStock || 0, // Set 0 nếu không có minStock
        unitId: result.unitId,
        name: result.name,
      })
      return result
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw IngredientNotFoundException
      }
      if (isUniqueConstraintPrisma(error)) {
        throw IngredientAlreadyExitsException
      }
      if (isForeignKeyPrisma(error)) {
        throw new BadRequestException('Invalid updatedById: referenced user does not exist')
      }
      throw error
    }
  }
  async delete({ deletedById, id }: { id: number; deletedById: number }) {
    try {
      const result = await this.ingredientRepo.delete({ deletedById, id, isHard: true })

      // Xóa cache và Redis data khi xóa thành công
      const ingredientKey = CACHE_KEYS.INGREDIENT(id)
      await this.cacheService.del(ingredientKey)

      // Xóa dữ liệu khỏi Redis
      await this.redisService.del(ingredientKey)

      return result
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw IngredientNotFoundException
      }
      throw error
    }
  }
  async getAll(props: { query: IngredientQueryType }) {
    try {
      return await this.ingredientRepo.findAll(props.query)
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw IngredientNotFoundException
      }
      throw error
    }
  }
}
