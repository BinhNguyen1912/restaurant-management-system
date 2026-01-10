import { RecipeController } from '@/routes/recipe/recipe.controller'
import { RecipeRepo } from '@/routes/recipe/recipe.repo'
import { RecipeService } from '@/routes/recipe/recipe.service'
import { Module } from '@nestjs/common'
import { RedisService } from '@/shared/service/redis.service'
import { SharedSkuRecipeIngredientRepo } from '@/shared/shared-repository/shared-skuRecipeIngredient.repo'

@Module({
  controllers: [RecipeController],
  providers: [RecipeService, RecipeRepo, RedisService, SharedSkuRecipeIngredientRepo],
})
export class RecipeModule {}
