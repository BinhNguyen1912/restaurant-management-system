import { Injectable } from '@nestjs/common'
import { Category, CategoryTranslation } from '@prisma/client'
import { CategoryTranslationBodyType } from './category-translation.model'
import { UpdateCategoryBodyType } from '../category.model'
import { PrismaService } from '@/shared/service/prisma.service'

@Injectable()
export class CategoryTranslationRepo {
  constructor(private readonly prismaService: PrismaService) {}

  create({
    body,
    createdById,
  }: {
    body: CategoryTranslationBodyType
    createdById: number
  }): Promise<CategoryTranslation> {
    return this.prismaService.categoryTranslation.create({ data: { ...body, createdById } })
  }

  findUnique(id: number): Promise<CategoryTranslation | null> {
    return this.prismaService.categoryTranslation.findUnique({ where: { id } })
  }

  update({
    data,
    id,
    updatedById,
  }: {
    id: number
    data: UpdateCategoryBodyType
    updatedById: number
  }): Promise<CategoryTranslation> {
    return this.prismaService.categoryTranslation.update({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        ...data,
        updatedById,
      },
    })
  }
  delete({ id, deletedById, isHard }: { id: number; deletedById?: number; isHard?: boolean }) {
    return isHard
      ? this.prismaService.categoryTranslation.update({
          where: {
            id,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        })
      : this.prismaService.categoryTranslation.delete({
          where: {
            id,
            deletedAt: null,
          },
        })
  }
}
