/* eslint-disable prefer-const */
import { Prisma } from '@prisma/client'
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

  /**
   * Ghi 1 lần nhập hàng và CỘNG DỒN tồn kho trong CÙNG transaction.
   *
   * Dùng `increment` (không ghi đè) nên không thể "nhập 5 mà mất 10". Giá vốn tính lại theo
   * bình quân gia quyền: (tồn cũ × giá cũ + SL nhập × giá nhập) / (tồn cũ + SL nhập).
   * Nếu tồn cũ ≤ 0 thì lấy thẳng giá nhập lần này (không chia cho số âm/0).
   */
  async createStockReceipt({
    ingredientId,
    quantity,
    unitCost,
    supplier,
    note,
    images,
    createdById,
  }: {
    ingredientId: number
    quantity: number
    unitCost: number
    supplier?: string
    note?: string
    images?: string[]
    createdById: number
  }) {
    return this.prismaService.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.findUnique({
        where: { id: ingredientId, deletedAt: null },
        select: { id: true, stock: true, unitCost: true },
      })
      if (!ingredient) return null

      const oldStock = Number(ingredient.stock)
      const oldCost = Number(ingredient.unitCost)
      const newStock = oldStock + quantity
      /**
       * Bình quân gia quyền, nhưng `oldCost = 0` nghĩa là **CHƯA KHAI GIÁ**, không phải "hàng miễn phí".
       * Nếu vẫn chia bình quân thì tồn cũ kéo giá vốn xuống sai (4kg giá 0 + 5kg giá 50k -> 27.7k
       * trong khi thực tế vừa mua 50k). Chỉ bình quân khi đã biết giá cũ.
       */
      const hasKnownOldCost = oldStock > 0 && oldCost > 0
      const newUnitCost = hasKnownOldCost ? (oldStock * oldCost + quantity * unitCost) / newStock : unitCost

      const updated = await tx.ingredient.update({
        where: { id: ingredientId },
        data: {
          /**
           * `increment` chứ KHÔNG ghi `newStock` tuyệt đối: hai phiếu nhập đồng thời cùng đọc
           * `oldStock` rồi ghi đè thì một phiếu biến mất. `stock` trả về là số sau khi cộng.
           */
          stock: { increment: quantity },
          unitCost: new Prisma.Decimal(Math.round(newUnitCost * 100) / 100),
        },
        select: { id: true, name: true, stock: true, unitCost: true, unitId: true, minStock: true },
      })

      const receipt = await tx.stockReceipt.create({
        data: {
          ingredientId,
          quantity,
          unitCost: new Prisma.Decimal(unitCost),
          supplier: supplier?.trim() || null,
          note: note?.trim() || null,
          images: images ?? [],
          stockAfter: newStock,
          createdById,
        },
      })

      return { receipt, ingredient: updated }
    })
  }

  /** Lịch sử nhập hàng của 1 nguyên liệu, mới nhất trước */
  listStockReceipts(ingredientId: number, limit = 50) {
    return this.prismaService.stockReceipt.findMany({
      where: { ingredientId },
      orderBy: { receivedAt: 'desc' },
      take: limit,
      include: { createdBy: { select: { name: true } } },
    })
  }
}
