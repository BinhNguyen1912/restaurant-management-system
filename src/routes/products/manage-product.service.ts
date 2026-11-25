import { ForbiddenException, Injectable } from '@nestjs/common'
import { ProductRepository } from './product.repo'
import {
  CreateProductBodyType,
  GenerateSKU,
  GetManageProductQueryType,
  GetProductQueryType,
  UpdateProductBodyType,
} from './product.model'
import { ProductExitsException, ProductForeignKeyErrorException, ProductNotFoundException } from './product.error'
import { roleName } from '@/shared/constants/role.constant'
import { DEFAULT_PRODUCT_LANGUAGE } from '@/shared/constants/product.constant'
import { GetAllLanguages } from '@/shared/constants/others.constant'
import { isForeignKeyPrisma, isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { AuditLogService } from '@/shared/service/audit-log.service'
import { PrismaService } from '@/shared/service/prisma.service'
import { Prisma } from '@prisma/client'
@Injectable()
export class ManageProductService {
  constructor(
    private readonly productRepo: ProductRepository,
    private readonly auditLogService: AuditLogService,
    private readonly prismaService: PrismaService,
  ) {}

  validatePrivilege({
    userIdRquest,
    createdById,
    roleNameRequest,
  }: {
    createdById: number | undefined | null
    userIdRquest: number
    roleNameRequest: string
  }) {
    if (createdById !== userIdRquest && roleNameRequest !== roleName.ADMIN) {
      throw new ForbiddenException()
    }
    return true
  }
  async create({ createdById, data }: { data: CreateProductBodyType; createdById: number }) {
    try {
      /**
       * Bản dịch sinh từ `name`/`description` của body LUÔN ghi vào ngôn ngữ gốc (vi).
       * Trước đây lấy theo locale của request -> admin đang ở EN mà lưu form (form đọc cột gốc
       * tiếng Việt) sẽ ghi đè bản dịch tiếng Anh bằng tiếng Việt.
       */
      const languageId = DEFAULT_PRODUCT_LANGUAGE

      if (!data.variants || data.variants.length === 0) {
        // Không có variant -> SKU mặc định (service là nguồn quyết định, schema chỉ kiểm tra hình dạng)
        data.skus = [
          {
            image: data.images?.[0] || '',
            price: data.basePrice ?? 0,
            value: `${data.name}`,
          },
        ]
      }

      return await this.productRepo.createdById(data, createdById, languageId)
    } catch (error) {
      if (isForeignKeyPrisma(error)) {
        throw ProductForeignKeyErrorException
      }
      if (isUniqueConstraintPrisma(error)) {
        throw ProductExitsException
      }
      throw error
    }
  }
  async findById(props: { productId: number; userIdRequest: number; roleNameRequest: string }) {
    {
      // quản trị cần thấy MỌI bản dịch để sửa, không lọc theo ngôn ngữ đang xem
      const languageId = GetAllLanguages
      const product = await this.productRepo.getDetail({
        languageId,
        productId: props.productId,
      })

      if (!product) throw ProductNotFoundException
      this.validatePrivilege({
        createdById: product?.createdById,
        userIdRquest: props.userIdRequest,
        roleNameRequest: props.roleNameRequest,
      })
      return product
    }
  }
  async update({
    data,
    productId,
    roleNameRequest,
    updatedById,
  }: {
    productId: number
    roleNameRequest: string
    data: UpdateProductBodyType
    updatedById: number
  }) {
    const product = await this.productRepo.findById(productId)
    if (!product) throw ProductNotFoundException
    this.validatePrivilege({
      userIdRquest: updatedById,
      createdById: product?.createdById,
      roleNameRequest,
    })
    try {
      // như create: name/description của body là nội dung gốc tiếng Việt
      const languageId = DEFAULT_PRODUCT_LANGUAGE

      // Giá bán trước khi sửa — để audit biết đổi từ bao nhiêu sang bao nhiêu (ticket #10)
      const beforeSkus = await this.prismaService.sKU.findMany({
        where: { productId, deletedAt: null },
        select: { id: true, value: true, price: true },
      })

      const updateProduct = await this.productRepo.update({ data, id: productId, updatedById, languageId })

      // ---- audit đổi giá: chỉ ghi khi giá THẬT SỰ đổi, và không được làm hỏng việc bán hàng ----
      const afterSkus = await this.prismaService.sKU.findMany({
        where: { productId, deletedAt: null },
        select: { id: true, value: true, price: true },
      })
      const priceChanges = afterSkus
        .map((after) => {
          const before = beforeSkus.find((sku) => sku.id === after.id)
          if (!before) return null
          if (new Prisma.Decimal(before.price).equals(after.price)) return null
          return { skuId: after.id, value: after.value, from: before.price, to: after.price }
        })
        .filter((change): change is { skuId: number; value: string; from: Prisma.Decimal; to: Prisma.Decimal } => change !== null)
      const removedSkus = beforeSkus.filter((before) => !afterSkus.some((after) => after.id === before.id))

      if (priceChanges.length || removedSkus.length) {
        await this.auditLogService.recordSafe({
          actorId: updatedById,
          actorRole: roleNameRequest,
          action: priceChanges.length ? 'PRODUCT_PRICE_CHANGED' : 'ORDER_PRICE_CHANGED',
          entityType: 'PRODUCT',
          entityId: productId,
          before: {
            prices: beforeSkus.map((sku) => ({ skuId: sku.id, value: sku.value, price: sku.price.toString() })),
          },
          after: {
            prices: afterSkus.map((sku) => ({ skuId: sku.id, value: sku.value, price: sku.price.toString() })),
            changes: priceChanges.map((change) => ({
              skuId: change.skuId,
              value: change.value,
              from: change.from.toString(),
              to: change.to.toString(),
            })),
            removedSkuIds: removedSkus.map((sku) => sku.id),
          },
        })
      }

      return updateProduct
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw ProductNotFoundException
      }
      if (isForeignKeyPrisma(error)) {
        throw ProductForeignKeyErrorException
      }
      if (isUniqueConstraintPrisma(error)) {
        throw ProductExitsException
      }
      throw error
    }
  }
  async delete({
    deletedById,
    productId,
    roleNameRequest,
  }: {
    productId: number
    deletedById: number
    roleNameRequest: string
  }) {
    const product = await this.productRepo.findById(productId)
    if (!product) throw ProductNotFoundException
    this.validatePrivilege({
      userIdRquest: deletedById,
      createdById: product?.createdById,
      roleNameRequest,
    })
    try {
      // await this.productRepo.delete({ id: productId, deletedById }, false)
      return await this.productRepo.delete({ id: productId, deletedById }, false)
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw ProductNotFoundException
      }
      throw error
    }
  }

  async list(props: { query: GetManageProductQueryType; userIdRequest: number; roleNameRequest: string }) {
    this.validatePrivilege({
      userIdRquest: props.userIdRequest,
      createdById: props.query.createdById,
      roleNameRequest: props.roleNameRequest,
    })
    const languageId = GetAllLanguages
    try {
      return await this.productRepo.list({
        languageId,
        limit: props.query.limit,
        page: props.query.page,
        IsPublic: props.query.isPublic,
        categories: props.query.categories,
        minPrice: props.query.minPrice,
        maxPrice: props.query.maxPrice,
        name: props.query.name,
        orderBy: props.query.orderBy,
        sortBy: props.query.sortBy,
      })
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw ProductNotFoundException
      }
      throw error
    }
  }
}
