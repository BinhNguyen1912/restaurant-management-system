import { Prisma } from '@prisma/client'

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { LedgerPostingService } from '@/shared/service/ledger-posting.service'
import { computeOrderCogs } from '@/shared/service/cogs'

/**
 * Ghi bút toán giá vốn cho 1 đơn đã thu tiền (ticket #11):
 *
 *   Nợ COGS        (giá vốn)
 *   Có INVENTORY   (hàng trong kho giảm đi)
 *
 * Vì sao theo ĐƠN chứ không theo KỲ: mỗi đơn là 1 sự kiện đã chốt, ghi ngay trong transaction thu tiền
 * thì không bao giờ có chuyện "đơn PAID mà báo cáo thiếu giá vốn"; hỏng thì rollback cả cụm.
 * Idempotent theo đơn -> webhook gọi lặp không sinh 2 bút toán.
 */
@Injectable()
export class CogsService {
  private readonly logger = new Logger(CogsService.name)

  constructor(
    private readonly prismaService: PrismaService,
    private readonly ledgerPosting: LedgerPostingService,
  ) {}

  async postOrderCogs({ orderId, branchId }: { orderId: number; branchId: number }, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prismaService

    const items = await client.productSKUSnapshot.findMany({
      where: { orderId },
      select: { skuId: true, quantity: true },
    })
    if (!items.length) return null

    const skuIds = [...new Set(items.map((item) => item.skuId))]
    const recipes = await client.sKURecipeIngredient.findMany({
      where: { skuId: { in: skuIds }, deletedAt: null },
      select: { skuId: true, ingredientId: true, quantity: true, unitId: true },
    })
    if (!recipes.length) return null // món không có recipe -> chưa xác định được giá vốn, không bịa số

    const ingredientIds = [...new Set(recipes.map((row) => row.ingredientId))]
    const ingredientsRows = await client.ingredient.findMany({
      where: { id: { in: ingredientIds }, deletedAt: null },
      select: { id: true, name: true, unitCost: true, unitId: true },
    })

    // quy đổi đơn vị: chỉ cần cho các cặp đơn vị thật sự khác nhau trong recipe
    const pairs = new Set(
      recipes
        .filter((row) => ingredientsRows.some((ingredient) => ingredient.id === row.ingredientId && ingredient.unitId !== row.unitId))
        .map((row) => `${row.unitId}->${ingredientsRows.find((ingredient) => ingredient.id === row.ingredientId)?.unitId}`),
    )
    const conversions = pairs.size
      ? await client.unitConversion.findMany({
          where: { deletedAt: null, fromUnitId: { in: [...pairs].map((pair) => pair.split('->')[0]) } },
          select: { fromUnitId: true, toUnitId: true, factor: true },
        })
      : []

    const result = computeOrderCogs({
      items: items.map((item) => ({ skuId: item.skuId, quantity: item.quantity })),
      recipes: recipes.map((row) => ({ ...row, quantity: row.quantity })),
      ingredients: ingredientsRows.map((row) => ({
        id: row.id,
        name: row.name,
        unitCost: row.unitCost,
        unitId: row.unitId,
      })),
      conversions,
    })

    if (result.missingCost.length) {
      // Không chặn bán hàng, nhưng phải kêu: báo cáo lãi gộp đang thiếu đúng các nguyên liệu này
      this.logger.warn(
        `COGS đơn #${orderId}: nguyên liệu chưa khai giá nhập -> ${result.missingCost.map((row) => `${row.name}#${row.ingredientId}`).join(', ')}`,
      )
    }
    if (result.unconvertedUnits.length) {
      this.logger.warn(
        `COGS đơn #${orderId}: không quy đổi được đơn vị -> ${result.unconvertedUnits.map((row) => `${row.from}->${row.to}`).join(', ')} (đang tính 1:1)`,
      )
    }
    if (result.total.lessThanOrEqualTo(0)) return null

    return this.ledgerPosting.postEntry(
      {
        branchId,
        refType: 'ORDER_COGS',
        refId: orderId,
        idempotencyKey: `cogs:order:${orderId}`,
        memo: `Giá vốn đơn #${orderId}`,
        lines: [
          { accountCode: 'COGS', direction: 'DEBIT', amount: result.total, orderId },
          { accountCode: 'INVENTORY', direction: 'CREDIT', amount: result.total, orderId },
        ],
      },
      tx,
    )
  }
}
