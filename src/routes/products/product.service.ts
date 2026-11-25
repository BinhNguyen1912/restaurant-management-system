import { Injectable } from '@nestjs/common'
import { GetAllLanguages } from '@/shared/constants/others.constant'
import { ProductRepository } from './product.repo'
import { CreateProductBodyType, GetProductQueryType, UpdateProductBodyType } from './product.model'
import { Locale } from '@/shared/i18n/locale'
import { localizeProduct, localizeProducts } from '@/shared/i18n/localize'
import { ProductNotFoundException } from '@/routes/products/product.error'
import { isNotFoundPrisma } from '@/shared/helper'
@Injectable()
export class ProductService {
  constructor(private readonly productRepo: ProductRepository) {}

  async getDetail(props: { productId: number; locale: Locale }) {
    // repo lấy mọi bản dịch (languageId = 'all'), việc chọn ngôn ngữ làm ở đây để
    // fallback (en -> vi) nằm trong 1 hàm có test thay vì trong từng câu query
    const product = await this.productRepo.getDetail({
      languageId: GetAllLanguages,
      productId: props.productId,
      isPublic: true,
    })
    if (!product) throw ProductNotFoundException
    return localizeProduct(product as any, props.locale) as any
  }

  async list(props: { query: GetProductQueryType; locale: Locale }) {
    try {
      const result = await this.productRepo.list({
        languageId: GetAllLanguages,
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
      return { ...result, data: localizeProducts(result.data as any, props.locale) } as any
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw ProductNotFoundException
      }
      throw error
    }
  }
}
