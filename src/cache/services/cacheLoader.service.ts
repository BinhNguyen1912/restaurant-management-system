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

  /**
   * Nạp tồn kho từ Postgres vào Redis — **chỉ cho key chưa có**.
   *
   * Lúc đang bán, Redis mới là nguồn sự thật của tồn kho: đơn trừ tồn trên Redis TRƯỚC, còn
   * `Ingredient.stock` chỉ được cập nhật sau bởi job đồng bộ. Ghi đè tuyệt đối mỗi lần khởi động
   * (restart, deploy, crash-restart) sẽ hoàn lại phần đã bán của các đơn đang chờ job ⇒ bán âm.
   * Key đã có thì chỉ cập nhật các trường tĩnh (minStock/unitId).
   *
   * Lệch thật (ví dụ sửa tay trong DB) được xử lý bằng script đối chiếu, không bằng ghi đè im lặng.
   */
  async loadIngredients() {
    const ingredients = await this.prisma.ingredient.findMany()
    for (const ingredient of ingredients) {
      const key = CACHE_KEYS.INGREDIENT(ingredient.id)
      const existing = await this.redis.getHash<string>(key)
      if (existing?.stock !== undefined) {
        await this.redis.setHash(key, {
          minStock: ingredient.minStock,
          unitId: ingredient.unitId,
        })
        continue
      }
      await this.redis.setHash(key, {
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
