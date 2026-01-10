import { CategoryController } from '@/routes/categories/category.controller'
import { CategoryRepo } from '@/routes/categories/category.repo'
import { CategoryService } from '@/routes/categories/category.service'
import { GuestRepo } from '@/routes/guest/guest.repo'
import { Module } from '@nestjs/common'

@Module({
  controllers: [CategoryController],
  providers: [CategoryService, CategoryRepo],
})
export class CategoryModule {}
