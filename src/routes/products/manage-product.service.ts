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
import { I18nContext } from 'nestjs-i18n'
import { roleName } from '@/shared/constants/role.constant'
import { isForeignKeyPrisma, isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
@Injectable()
export class ManageProductService {
  constructor(private readonly productRepo: ProductRepository) {}

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
      const languageId = I18nContext.current()?.lang as string

      if (!data.variants || data.variants.length === 0) {
        // Không có variant -> SKU mặc định
        data.skus = [
          {
            image: '',
            price: data.basePrice ?? 0, // dùng basePrice nếu có
            value: `${data.name}`, // dùng tên sản phẩm hoặc fallback "Nguyên bản"
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
      const languageId = I18nContext.current()?.lang as string
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
      const languageId = I18nContext.current()?.lang as string
      const updateProduct = await this.productRepo.update({ data, id: productId, updatedById, languageId })
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
    const languageId = I18nContext.current()?.lang as string
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
