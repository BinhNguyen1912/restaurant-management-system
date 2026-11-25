import { Injectable } from '@nestjs/common'
import { CategoryTranslationRepo } from './category-translation.repo'
import { CategoryTranslationBodyType } from './category-translation.model'
import {
  CategoryIdOrLanguageIdFkConstraintFailedException,
  CategoryTranslationExitsException,
  CategoryTranslationNotFoundException,
} from './category-translation.error'
import { UpdateCategoryBodyType } from '../category.model'
import { isForeignKeyPrisma, isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'

@Injectable()
export class CategoryTranslationService {
  constructor(private readonly categoryTranslationRepo: CategoryTranslationRepo) {}

  async create({ body, createdById }: { body: CategoryTranslationBodyType; createdById: number }) {
    try {
      return await this.categoryTranslationRepo.create({ body, createdById })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw CategoryTranslationExitsException
      }
      if (isForeignKeyPrisma(error)) {
        throw CategoryIdOrLanguageIdFkConstraintFailedException
      }
      throw error
    }
  }
  async listByCategory(categoryId: number) {
    const data = await this.categoryTranslationRepo.findByCategory(categoryId)
    return { message: 'Success.CategoryTranslations', data }
  }

  async findUnique(id: number) {
    const categoryTranslation = await this.categoryTranslationRepo.findUnique(id)
    if (!categoryTranslation) throw CategoryTranslationExitsException
    return categoryTranslation
  }
  async update({ data, id, updatedById }: { id: number; data: UpdateCategoryBodyType; updatedById: number }) {
    try {
      return await this.categoryTranslationRepo.update({ data, id, updatedById })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw CategoryTranslationExitsException
      }
      if (isNotFoundPrisma(error)) {
        throw CategoryTranslationNotFoundException
      }
      throw error
    }
  }

  async delete({ deletedById, id }: { id: number; deletedById: number }) {
    try {
      await this.categoryTranslationRepo.delete({ id, deletedById, isHard: true })
      return {
        message: 'Deleted successfully',
      }
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw CategoryTranslationNotFoundException
      }
      throw error
    }
  }
}
