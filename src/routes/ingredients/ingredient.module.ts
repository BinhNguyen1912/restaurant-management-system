import { IngredientController } from '@/routes/ingredients/ingredient.controller'
import { IngredientRepo } from '@/routes/ingredients/ingredient.repo'
import { IngredientService } from '@/routes/ingredients/ingredient.service'
import { Module } from '@nestjs/common'

@Module({
  controllers: [IngredientController],
  providers: [IngredientService, IngredientRepo],
})
export class IngredientModule {}
