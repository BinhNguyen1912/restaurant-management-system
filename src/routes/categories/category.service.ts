import { Injectable } from '@nestjs/common'
import { CategoryBodyType, UpdateCategoryBodyType } from './category.model'
import {
  CategoryAlreadyExitsException,
  CategoryCanNotBeItsOwnPararentException,
  CategoryNotFoundException,
} from './category.error'
import { Locale } from '@/shared/i18n/locale'
import { localizeCategory } from '@/shared/i18n/localize'
import { GetAllLanguages } from '@/shared/constants/others.constant'
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
  async findUnique(id: number, locale: Locale = 'vi') {
    const category = await this.categoryRepo.findUnique(id, GetAllLanguages)

    if (!category) throw CategoryNotFoundException
    return localizeCategory(category as any, locale) as any
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
  async getAll(parentCategoryId: number | undefined, locale: Locale = 'vi') {
    try {
      const result = await this.categoryRepo.findAll({ parentCategoryId, languageId: GetAllLanguages })
      return { ...result, data: (result.data as any[]).map((item) => localizeCategory(item, locale)) } as any
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw CategoryNotFoundException
      }
      throw error
    }
  }
}
