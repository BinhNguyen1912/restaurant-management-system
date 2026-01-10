import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'

import { IngredientType } from '@/shared/models/shared-ingredient'
import {
  SkuRecipeIngredientBodyType,
  SkuRecipeIngredientDetailResType,
  skuRecipeIngredientListResType,
} from '@/routes/recipe/recipe.model'
import { SkuRecipeIngredientResDTO } from '@/routes/recipe/recipe.dtos'
import { AnyAaaaRecord } from 'dns'
import { PagitionQueryType } from '@/shared/models/request.model'
import { NotFoundRecipeBySkuId } from '@/routes/recipe/recipe.error'
import { SharedSkuRecipeIngredientRepo } from '@/shared/shared-repository/shared-skuRecipeIngredient.repo'

const include = {
  ingredient: { select: { name: true, id: true } },
  unit: { select: { name: true } },
  sku: {
    include: {
      product: {
        select: {
          name: true,
          id: true,
        },
      },
    },
  },
}

@Injectable()
export class RecipeRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sharedSkuRecipeIngredientRepo: SharedSkuRecipeIngredientRepo,
  ) {}

  async create({
    body,
    createdById,
  }: {
    body: SkuRecipeIngredientBodyType
    createdById: number
  }): Promise<SkuRecipeIngredientDetailResType> {
    await this.prismaService.sKURecipeIngredient.createMany({
      data: body.ingredients.map((ingredient) => ({
        quantity: ingredient.quantity,
        unitId: ingredient.unitId,
        ingredientId: ingredient.ingredientId,
        skuId: body.skuId,
        createdById,
      })),
      skipDuplicates: true,
    })

    const data = await this.prismaService.sKURecipeIngredient.findMany({
      where: { skuId: body.skuId },
      include,
    })

    return {
      sku: {
        id: data[0].sku.id,
        value: data[0].sku.value,
        image: data[0].sku.image,
        product: {
          id: data[0].sku.product.id,
          name: data[0].sku.product.name,
        },
      },
      skuRecipeIngredients: this.sharedSkuRecipeIngredientRepo.mapSkuRecipeIngredients(data),
    }
  }

  async update({
    body,
    updatedById,
  }: {
    body: SkuRecipeIngredientBodyType
    updatedById: number
  }): Promise<SkuRecipeIngredientDetailResType> {
    const { skuId, ingredients } = body

    // Xoá các ingredient không còn trong list mới
    await this.prismaService.sKURecipeIngredient.deleteMany({
      where: {
        skuId,
        ingredientId: { notIn: ingredients.map((i) => i.ingredientId) },
      },
    })

    // Upsert từng ingredient
    for (const ingredient of ingredients) {
      await this.prismaService.sKURecipeIngredient.upsert({
        where: {
          skuId_ingredientId: {
            skuId,
            ingredientId: ingredient.ingredientId,
          },
        },
        update: {
          quantity: ingredient.quantity, // // cập nhật nếu đã có trong DB
          unitId: ingredient.unitId,
          updatedById,
        },
        create: {
          // Không có thì tạo mới
          skuId,
          ingredientId: ingredient.ingredientId,
          quantity: ingredient.quantity,
          unitId: ingredient.unitId,
          createdById: updatedById,
        },
      })
    }

    const data = await this.prismaService.sKURecipeIngredient.findMany({
      where: { skuId },
      include,
    })

    return {
      sku: {
        id: data[0].sku.id,
        value: data[0].sku.value,
        image: data[0].sku.image,
        product: {
          id: data[0].sku.product.id,
          name: data[0].sku.product.name,
        },
      },
      skuRecipeIngredients: this.sharedSkuRecipeIngredientRepo.mapSkuRecipeIngredients(data),
    }
  }

  async DeleteAllBySku({ skuId, deletedById, isHard }: { skuId: number; deletedById: number; isHard?: boolean }) {
    return isHard
      ? this.prismaService.sKURecipeIngredient.updateMany({
          where: {
            skuId,
          },
          data: {
            deletedAt: new Date(),
            deletedById,
          },
        })
      : this.prismaService.sKURecipeIngredient.deleteMany({
          where: {
            skuId,
          },
        })
  }

  async findAll({ limit, page }: PagitionQueryType): Promise<skuRecipeIngredientListResType> {
    const take = limit || 10
    const skip = (page - 1) * limit || 1

    const [data, totalItems] = await Promise.all([
      this.prismaService.sKURecipeIngredient.findMany({
        where: {
          deletedAt: null,
        },
        include,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
      }),
      this.prismaService.sKURecipeIngredient.count({
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
    }
  }
}
