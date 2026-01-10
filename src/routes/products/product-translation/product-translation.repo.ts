import { Injectable } from '@nestjs/common'
import {
  GetProductTranslationDetailResType,
  ProductTranslationBodyType,
  UpdateProductTranslationBodyType,
} from './product-translation.model'
import { UpdateProductBodyType } from '../product.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { ProductTranslationType } from '@/shared/models/shared-product-translation.model'
@Injectable()
export class ProductTranslationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  create({
    body,
    createdById,
  }: {
    body: ProductTranslationBodyType
    createdById: number
  }): Promise<ProductTranslationType> {
    return this.prismaService.productTranslation.create({ data: { ...body, createdById } })
  }

  findUnique(id: number): Promise<GetProductTranslationDetailResType | null> {
    return this.prismaService.productTranslation.findUnique({ where: { id } })
  }

  update({
    data,
    id,
    updatedById,
  }: {
    id: number
    data: UpdateProductTranslationBodyType
    updatedById: number
  }): Promise<ProductTranslationType> {
    return this.prismaService.productTranslation.update({
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
      ? this.prismaService.productTranslation.update({
          where: {
            id,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        })
      : this.prismaService.productTranslation.delete({
          where: {
            id,
            deletedAt: null,
          },
        })
  }
}
