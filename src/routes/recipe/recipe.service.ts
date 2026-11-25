import { Injectable } from '@nestjs/common'

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
import { RecipeRepo } from '@/routes/recipe/recipe.repo'
import { SkuRecipeIngredientBodyType } from '@/routes/recipe/recipe.model'
import { PagitionQueryType } from '@/shared/models/request.model'
import { SharedSkuRecipeIngredientRepo } from '@/shared/shared-repository/shared-skuRecipeIngredient.repo'
import { RedisService } from '@/shared/service/redis.service'
import { CACHE_KEYS } from '@/cache/cache.constant'

@Injectable()
export class RecipeService {
  constructor(
    private readonly recipeRepo: RecipeRepo,
    private readonly sharedSkuRecipeIngredientRepo: SharedSkuRecipeIngredientRepo,
    private readonly redisService: RedisService,
  ) {}

  async create({ body, createdById }: { body: SkuRecipeIngredientBodyType; createdById: number }) {
    try {
      const result = await this.recipeRepo.create({ body, createdById })
      for (const ingredient of body.ingredients) {
        await this.cacheSkuRecipeIngredient(body.skuId, ingredient.ingredientId, ingredient)
      }
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
    const ingredient = await this.sharedSkuRecipeIngredientRepo.findUniqueRecipeIngredient(id)

    if (!ingredient) throw IngredientNotFoundException
    return ingredient
  }

  async update({ body, updatedById }: { body: SkuRecipeIngredientBodyType; updatedById: number }) {
    try {
      const result = await this.recipeRepo.update({ body, updatedById })

      const currentRecipe = await this.sharedSkuRecipeIngredientRepo.findUniqueRecipeIngredient(body.skuId)
      const currentIngredientIds = currentRecipe?.skuRecipeIngredients?.map((i) => i.ingredientId) || []
      const newIngredientIds = body.ingredients.map((i) => i.ingredientId)

      for (const ingredientId of currentIngredientIds) {
        if (!newIngredientIds.includes(ingredientId)) {
          await this.removeSkuRecipeIngredientFromCache(body.skuId, ingredientId)
        }
      }

      for (const ingredient of body.ingredients) {
        await this.cacheSkuRecipeIngredient(body.skuId, ingredient.ingredientId, ingredient)
      }

      return result
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw IngredientNotFoundException
      }
      if (isUniqueConstraintPrisma(error)) {
        throw IngredientAlreadyExitsException
      }
      if (isForeignKeyPrisma(error)) {
        throw IngredientNotFoundException
      }
      throw error
    }
  }
  async delete({ deletedById, skuId }: { skuId: number; deletedById: number }): Promise<MessageResType> {
    try {
      await this.removeAllSkuRecipeIngredientsFromCache(skuId)

      await this.recipeRepo.DeleteAllBySku({ deletedById, skuId, isHard: true })
      return {
        message: 'Deleted successfully',
      }
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw IngredientNotFoundException
      }
      throw error
    }
  }
  async getAll(query: PagitionQueryType) {
    try {
      return await this.recipeRepo.findAll(query)
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw IngredientNotFoundException
      }
      throw error
    }
  }

  private async cacheSkuRecipeIngredient(skuId: number, ingredientId: number, data: any) {
    const key = CACHE_KEYS.SKU_RECIPE_INGREDIENT({ skuId, ingredientId })
    await this.redisService.setHash(key, {
      skuId: skuId.toString(),
      ingredientId: ingredientId.toString(),
      quantity: data.quantity.toString(),
      unitId: data.unitId,
      createdAt: new Date().toISOString(),
    })
  }

  private async removeSkuRecipeIngredientFromCache(skuId: number, ingredientId: number) {
    const key = CACHE_KEYS.SKU_RECIPE_INGREDIENT({ skuId, ingredientId })
    await this.redisService.del(key)
  }

  private async removeAllSkuRecipeIngredientsFromCache(skuId: number) {
    const recipeIngredients = await this.sharedSkuRecipeIngredientRepo.findUniqueRecipeIngredient(skuId)
    if (recipeIngredients?.skuRecipeIngredients) {
      for (const ingredient of recipeIngredients.skuRecipeIngredients) {
        await this.removeSkuRecipeIngredientFromCache(skuId, ingredient.ingredientId)
      }
    }
  }
}
