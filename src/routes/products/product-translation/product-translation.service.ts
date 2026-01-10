import { Injectable } from '@nestjs/common'
import { ProductTranslationRepository } from './product-translation.repo'
import { ProductTranslationBodyType, UpdateProductTranslationBodyType } from './product-translation.model'
import {
  ProductTranslationExitsException,
  ProductTranslationForeignKeyErrorException,
  ProductTranslationNotFoundException,
} from './product-translation.error'
import { isForeignKeyPrisma, isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'

@Injectable()
export class ProductTranslationService {
  constructor(private readonly productTranslationRepo: ProductTranslationRepository) {}

  async create({ body, createdById }: { body: ProductTranslationBodyType; createdById: number }) {
    try {
      return await this.productTranslationRepo.create({ body, createdById })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw ProductTranslationExitsException
      }
      if (isForeignKeyPrisma(error)) {
        throw ProductTranslationForeignKeyErrorException
      }
      throw error
    }
  }
  async findUnique(id: number) {
    const productTranslation = await this.productTranslationRepo.findUnique(id)
    if (!productTranslation) throw ProductTranslationNotFoundException
    return productTranslation
  }
  async update({ data, id, updatedById }: { id: number; data: UpdateProductTranslationBodyType; updatedById: number }) {
    try {
      return await this.productTranslationRepo.update({ data, id, updatedById })
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw ProductTranslationExitsException
      }
      if (isNotFoundPrisma(error)) {
        throw ProductTranslationNotFoundException
      }
      throw error
    }
  }

  async delete({ deletedById, id }: { id: number; deletedById: number }) {
    try {
      await this.productTranslationRepo.delete({ id, deletedById, isHard: true })
      return {
        message: 'Deleted successfully',
      }
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw ProductTranslationNotFoundException
      }
      throw error
    }
  }
}
