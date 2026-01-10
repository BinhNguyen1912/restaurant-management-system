/* eslint-disable prefer-const */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import {
  CreateIngredientBodyType,
  GetAllIngredientResType,
  GetIngredientDetailResType,
  IngredientQueryType,
  UpdateIngredientBodyType,
} from '@/routes/ingredients/ingredient.model'
import { IngredientType, IngredientSchema } from '@/shared/models/shared-ingredient'

@Injectable()
export class IngredientRepo {
  constructor(private readonly prismaService: PrismaService) {}
  async create({
    body,
    createdById,
  }: {
    body: CreateIngredientBodyType
    createdById: number
  }): Promise<IngredientType> {
    const { enableLowStockWarning, minStock, ...ingredientData } = body

    const data = await this.prismaService.ingredient.create({
      data: {
        ...ingredientData,
        minStock: enableLowStockWarning ? minStock : undefined,
        createdById,
      },
    })
    return IngredientSchema.parse(data)
  }
  async findUnique(id: number): Promise<IngredientType | null> {
    const data = await this.prismaService.ingredient.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        unit: true,
      },
    })
    return data ? IngredientSchema.parse(data) : null
  }
  async update({
    data,
    id,
    updatedById,
  }: {
    data: UpdateIngredientBodyType
    updatedById: number
    id: number
  }): Promise<IngredientType> {
    const { enableLowStockWarning, minStock, ...ingredientData } = data
    // Xử lý logic minStock dựa trên enableLowStockWarning
    let updateData: any = {
      ...ingredientData,
      updatedById,
    }

    if (enableLowStockWarning !== undefined) {
      if (enableLowStockWarning) {
        // Bật cảnh báo - cần minStock
        updateData.minStock = minStock
      } else {
        // Tắt cảnh báo - set minStock = undefined
        updateData.minStock = undefined
      }
    } else if (minStock !== undefined) {
      // Chỉ update minStock mà không thay đổi enableLowStockWarning
      updateData.minStock = minStock
    }

    return (await this.prismaService.ingredient.update({
      where: {
        id,
        deletedAt: null,
      },
      data: updateData,
    })) as any
  }
  async delete({
    deletedById,
    id,
    isHard,
  }: {
    id: number
    deletedById: number
    isHard?: boolean
  }): Promise<IngredientType> {
    const result = isHard
      ? await this.prismaService.ingredient.update({
          where: {
            id,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        })
      : await this.prismaService.ingredient.delete({
          where: {
            id,
            deletedAt: null,
          },
        })

    return result as any
  }
  async findAll({ limit, page }: IngredientQueryType): Promise<GetAllIngredientResType> {
    const take = limit
    const skip = (page - 1) * limit

    const [data, totalItems] = await Promise.all([
      this.prismaService.ingredient.findMany({
        where: {
          deletedAt: null,
        },
        include: {
          unit: true,
          createdBy: {
            select: {
              name: true,
              id: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
      }),
      this.prismaService.ingredient.count({
        where: {
          deletedAt: null,
        },
      }),
    ])
    return {
      data,
      limit,
      page,
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
    } as any
  }
}
