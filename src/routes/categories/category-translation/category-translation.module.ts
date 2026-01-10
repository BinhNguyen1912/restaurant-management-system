import { Module } from '@nestjs/common'
import { CategoryTranslationService } from './category-translation.service'
import { CategoryTranslationController } from './category-translation.controller'
import { CategoryTranslationRepo } from './category-translation.repo'

@Module({
  controllers: [CategoryTranslationController],
  providers: [CategoryTranslationService, CategoryTranslationRepo],
})
export class CategoryTranslationModule {}
