import { CACHE_KEYS } from '@/cache/cache.constant'
import { CacheService } from '@/cache/services/cache.service'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'
import { RedisService } from '@/shared/service/redis.service'

@Injectable()
export class CacheLoaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly redis: RedisService,
  ) {}

  async loadIngredients() {
    const ingredients = await this.prisma.ingredient.findMany()
    for (const ingredient of ingredients) {
      await this.redis.setHash(CACHE_KEYS.INGREDIENT(ingredient.id), {
        stock: ingredient.stock,
        minStock: ingredient.minStock,
        unitId: ingredient.unitId,
      })
    }
  }

  async loadRecipes() {
    const recipes = await this.prisma.sKURecipeIngredient.findMany()
    const bySku = new Map<number, Array<{ ingredientId: number; quantity: number; unitId: string }>>()
    for (const r of recipes) {
      const list = bySku.get(r.skuId) || []
      list.push({ ingredientId: r.ingredientId, quantity: r.quantity, unitId: r.unitId })
      bySku.set(r.skuId, list)
    }
    for (const [skuId, list] of bySku.entries()) {
      await this.redis.setJson(`recipe:${skuId}`, list)
    }
  }

  async loadUnitConversions() {
    const conversions = await this.prisma.unitConversion.findMany()
    for (const c of conversions) {
      await this.redis.setString(CACHE_KEYS.UNIT_CONVERSION(c.fromUnitId, c.toUnitId), c.factor)
    }
  }

  async preloadAll() {
    await Promise.all([this.loadIngredients(), this.loadRecipes(), this.loadUnitConversions()])
  }
}
