import { Injectable } from '@nestjs/common'
import {
  GetAllLanguageResType,
  LanguageBodyType,
  LanguageResType,
  LanguageType,
  UpdateLanguageBodyType,
} from './language.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { UserType } from '@/shared/models/shared-user.model'

@Injectable()
export class LanguageRepository {
  constructor(private readonly prismaService: PrismaService) {}
  createLanguage(body: LanguageBodyType & { createdById: number }): Promise<LanguageType | null> {
    return this.prismaService.language.create({ data: body })
  }
  findUniqueLanguageIncludeCreatedBy(unique: {
    id: string
  }): Promise<(LanguageType & { createdBy: Pick<UserType, 'id' | 'name'> | null }) | null> {
    return this.prismaService.language.findUnique({
      where: { ...unique, deletedAt: null },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })
  }
  async updateLanguage({
    data,
    id,
    updatedById,
  }: {
    id: string
    data: UpdateLanguageBodyType
    updatedById: number
  }): Promise<LanguageType> {
    return await this.prismaService.language.update({
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
  async getAllLanguage(): Promise<LanguageType[]> {
    return await this.prismaService.language.findMany({
      where: {
        deletedAt: null,
      },
    })
  }
  async deleteLanguage(id: string, isHard?: boolean) {
    return isHard
      ? await this.prismaService.language.delete({ where: { id, deletedAt: null } })
      : await this.prismaService.language.update({ where: { id }, data: { deletedAt: new Date() } })
  }
}
