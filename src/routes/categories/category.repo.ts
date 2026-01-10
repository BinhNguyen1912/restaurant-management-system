import { Injectable } from '@nestjs/common'
import {
  CategoryBodyType,
  CategoryResType,
  GetAllCategoryType,
  GetCategoryDetailType,
  UpdateCategoryBodyType,
} from './category.model'
import { GetAllLanguages } from '@/shared/constants/others.constant'
import { PrismaService } from '@/shared/service/prisma.service'
import { CategoryType } from '@/shared/models/shared-category.model'

@Injectable()
export class CategoryRepo {
  constructor(private readonly prismaService: PrismaService) {}
  create({ body, createdById }: { body: CategoryBodyType; createdById: number }): Promise<CategoryType> {
    const data = this.prismaService.category.create({
      data: {
        ...body,
        createdById,
      },
    })
    return data
  }
  findUnique(id: number, languageId: string): Promise<GetCategoryDetailType | null> {
    return this.prismaService.category.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        categoryTranslations: {
          where:
            languageId == GetAllLanguages
              ? { deletedAt: null }
              : {
                  languageId,
                  deletedAt: null,
                },
        },
      },
    })
  }
  update({
    data,
    id,
    updatedById,
  }: {
    data: UpdateCategoryBodyType
    updatedById: number
    id: number
  }): Promise<GetCategoryDetailType> {
    return this.prismaService.category.update({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        ...data,
        updatedById,
      },
      include: {
        categoryTranslations: {
          where: {
            deletedAt: null,
          },
        },
      },
    })
  }
  delete({ deletedById, id, isHard }: { id: number; deletedById: number; isHard?: boolean }) {
    return isHard
      ? this.prismaService.category.update({
          where: {
            id,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        })
      : this.prismaService.category.delete({
          where: {
            id,
            deletedAt: null,
          },
        })
  }
  async findAll({
    languageId,
    parentCategoryId,
  }: {
    parentCategoryId?: number
    languageId: string
  }): Promise<GetAllCategoryType> {
    const [data, totalItems] = await Promise.all([
      this.prismaService.category.findMany({
        where: {
          deletedAt: null,
          parentCategoryId: parentCategoryId ?? null,
        },
        include: {
          categoryTranslations: {
            where:
              languageId == GetAllLanguages
                ? { deletedAt: null }
                : {
                    languageId,
                    deletedAt: null,
                  },
          },
        },
      }),
      this.prismaService.category.count({
        where: {
          deletedAt: null,
          parentCategoryId: parentCategoryId ?? null,
        },
      }),
    ])
    return {
      data,
      totalItems,
    }
  }
}
