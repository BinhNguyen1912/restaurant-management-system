import { NotFoundRecipeBySkuId } from '@/shared/error'
import { SkuRecipeIngredientDetailResType } from '@/shared/models/shared-recipe.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class SharedSkuRecipeIngredientRepo {
  constructor(private readonly prismaService: PrismaService) {}
  mapSkuRecipeIngredients(rows: any[]) {
    return rows.map((row) => ({
      skuRecipeIngredientsId: row.id,
      name: row.ingredient.name,
      quantity: row.quantity,
      unit: row.unit.name,
      ingredientId: row.ingredientId,
    }))
  }

  async findUniqueRecipeIngredient(skuId: number): Promise<SkuRecipeIngredientDetailResType> {
    const rows = await this.prismaService.sKURecipeIngredient.findMany({
      where: { skuId, deletedAt: null },
      include: {
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
      },
    })

    if (!rows || rows.length === 0) {
      throw NotFoundRecipeBySkuId
    }

    const first = rows[0]
    return {
      sku: {
        id: first.sku.id,
        value: first.sku.value,
        image: first.sku.image,
        product: {
          id: first.sku.product.id,
          name: first.sku.product.name,
        },
      },
      skuRecipeIngredients: this.mapSkuRecipeIngredients(rows),
    }
  }
}
