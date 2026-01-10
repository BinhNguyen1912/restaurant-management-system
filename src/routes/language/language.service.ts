import { Injectable } from '@nestjs/common'
import { GetAllLanguageResType, LanguageBodyType, UpdateLanguageBodyType } from './language.model'
import { LanguageRepository } from './language.repo'
import { isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { LanguageExitsException, LanguageNotFoundException } from '@/routes/language/languages.error'

@Injectable()
export class LanguageService {
  constructor(private readonly languageRepository: LanguageRepository) {}
  async create(languageBodyType: LanguageBodyType & { createdById: number }) {
    try {
      return await this.languageRepository.createLanguage(languageBodyType)
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw LanguageExitsException
      }
      throw error
    }
  }

  async findOne(id: string) {
    try {
      const data = await this.languageRepository.findUniqueLanguageIncludeCreatedBy({ id })
      if (!data) throw LanguageNotFoundException
      return data
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw LanguageNotFoundException
      }
      throw error
    }
  }
  async updateLanguage({ id, data, updatedById }: { id: string; data: UpdateLanguageBodyType; updatedById: number }) {
    try {
      return await this.languageRepository.updateLanguage({ id, data, updatedById })
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw LanguageNotFoundException
      }
      throw error
    }
  }
  async getAllLanguage(): Promise<GetAllLanguageResType> {
    const data = await this.languageRepository.getAllLanguage()
    const totalItem = data.length
    return {
      data,
      totalItem,
    }
  }
  async delete(id: string) {
    try {
      await this.languageRepository.deleteLanguage(id)
      return { message: 'Delete successfully' }
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw LanguageNotFoundException
      }
      throw error
    }
  }
}
