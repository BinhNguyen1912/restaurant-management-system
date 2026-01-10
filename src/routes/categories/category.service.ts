import { Injectable } from '@nestjs/common'
import { CategoryBodyType, UpdateCategoryBodyType } from './category.model'
import {
  CategoryAlreadyExitsException,
  CategoryCanNotBeItsOwnPararentException,
  CategoryNotFoundException,
} from './category.error'
import { I18nContext } from 'nestjs-i18n'
import { CategoryRepo } from '@/routes/categories/category.repo'
import { isForeignKeyPrisma, isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { GuestRepo } from '@/routes/guest/guest.repo'

@Injectable()
export class CategoryService {
  constructor(private readonly categoryRepo: CategoryRepo) {}

  async create({ body, createdById }: { body: CategoryBodyType; createdById: number }) {
    try {
      return await this.categoryRepo.create({ body, createdById })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw CategoryAlreadyExitsException
      }
      throw error
    }
  }
  async findUnique(id: number) {
    const languageId = I18nContext.current()?.lang
    const category = await this.categoryRepo.findUnique(id, languageId as string)

    if (!category) throw CategoryNotFoundException
    return category
  }

  async update({ data, id, updatedById }: { id: number; data: UpdateCategoryBodyType; updatedById: number }) {
    try {
      if (id == data.parentCategoryId) throw CategoryCanNotBeItsOwnPararentException
      return await this.categoryRepo.update({ data, id, updatedById })
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw CategoryNotFoundException
      }
      if (isUniqueConstraintPrisma(error)) {
        throw CategoryAlreadyExitsException
      }
      if (isForeignKeyPrisma(error)) {
        throw CategoryNotFoundException
      }
      throw error
    }
  }
  async delete({ deletedById, id }: { id: number; deletedById: number }) {
    try {
      await this.categoryRepo.delete({ deletedById, id, isHard: true })
      return {
        message: 'Deleted successfully',
      }
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw CategoryNotFoundException
      }
      throw error
    }
  }
  async getAll(parentCategoryId?: number) {
    try {
      const languageId = I18nContext.current()?.lang
      return await this.categoryRepo.findAll({ parentCategoryId, languageId: languageId as string })
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw CategoryNotFoundException
      }
      throw error
    }
  }
}
