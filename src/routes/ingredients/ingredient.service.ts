import { BadRequestException, Injectable } from '@nestjs/common'

import { isForeignKeyPrisma, isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import {
  CreateIngredientBodyType,
  CreateStockReceiptType,
  IngredientQueryType,
  UpdateIngredientBodyType,
} from '@/routes/ingredients/ingredient.model'
import { AuditLogService } from '@/shared/service/audit-log.service'
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
    private readonly auditLog: AuditLogService,
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
  /**
   * Nhập hàng: cộng tồn kho + đồng bộ Redis + ghi nhật ký.
   *
   * Redis phải cập nhật ngay: trừ kho khi bán đọc từ Redis, nên nếu chỉ ghi DB thì lần bán tiếp
   * theo sẽ trừ trên số cũ và báo "không đủ tồn" dù vừa nhập hàng.
   */
  async createStockReceipt({
    ingredientId,
    data,
    createdById,
    actor,
  }: {
    ingredientId: number
    data: CreateStockReceiptType
    createdById: number
    actor?: { roleName?: string | null }
  }) {
    const result = await this.ingredientRepo.createStockReceipt({
      ingredientId,
      quantity: data.quantity,
      unitCost: data.unitCost ?? 0,
      supplier: data.supplier,
      note: data.note,
      images: data.images,
      createdById,
    })
    if (!result) throw IngredientNotFoundException

    const { receipt, ingredient } = result
    const ingredientKey = CACHE_KEYS.INGREDIENT(ingredient.id)
    await this.cacheService.del(ingredientKey)
    await this.redisService.setHash(ingredientKey, {
      stock: ingredient.stock,
      minStock: ingredient.minStock || 0,
      unitId: ingredient.unitId,
      name: ingredient.name,
    })

    await this.auditLog.recordSafe({
      actorId: createdById,
      actorRole: actor?.roleName ?? null,
      action: 'STOCK_RECEIVED',
      entityType: 'INGREDIENT',
      entityId: ingredient.id,
      before: { stock: Number(ingredient.stock) - data.quantity },
      after: {
        stock: Number(ingredient.stock),
        quantity: data.quantity,
        unitCost: Number(ingredient.unitCost),
        supplier: data.supplier ?? null,
        images: data.images ?? [],
      },
      reason: data.note ?? null,
    })

    return {
      message: 'Success.StockReceived',
      data: {
        receipt: { ...receipt, createdByName: null },
        stock: Number(ingredient.stock),
        unitCost: Number(ingredient.unitCost),
      },
    }
  }

  async listStockReceipts(ingredientId: number) {
    const ingredient = await this.ingredientRepo.findUnique(ingredientId)
    if (!ingredient) throw IngredientNotFoundException
    const receipts = await this.ingredientRepo.listStockReceipts(ingredientId)
    return {
      message: 'Success.StockReceipts',
      data: receipts.map((receipt) => ({
        ...receipt,
        unitCost: Number(receipt.unitCost),
        createdByName: receipt.createdBy?.name ?? null,
        createdBy: undefined,
      })),
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
