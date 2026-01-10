import { Injectable } from '@nestjs/common'
import { ProductRepository } from './product.repo'
import { CreateProductBodyType, GetProductQueryType, UpdateProductBodyType } from './product.model'
import { I18nContext } from 'nestjs-i18n'
import { ProductNotFoundException } from '@/routes/products/product.error'
import { isNotFoundPrisma } from '@/shared/helper'
@Injectable()
export class ProductService {
  constructor(private readonly productRepo: ProductRepository) {}

  async getDetail(props: { productId: number }) {
    const languageId = I18nContext.current()?.lang as string
    const product = await this.productRepo.getDetail({
      languageId,
      productId: props.productId,
      isPublic: true,
    })
    if (!product) throw ProductNotFoundException
    return product
  }

  async list(props: { query: GetProductQueryType }) {
    const languageId = I18nContext.current()?.lang as string
    try {
      return await this.productRepo.list({
        languageId,
        limit: props.query.limit,
        page: props.query.page,
        IsPublic: true,
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
