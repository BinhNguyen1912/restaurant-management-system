import { toMoneyNumbers } from '@/shared/service/money-serializer'
import { Injectable } from '@nestjs/common'
import {
  CreateProductBodyType,
  GenerateSKU,
  GetListProductsResType,
  GetProductDetailType,
  GetProductQueryType,
  UpdateProductBodyType,
} from './product.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Prisma } from '@prisma/client'
import { GetAllLanguages, OrderByType, SortBy } from '@/shared/constants/others.constant'
import { ProductType } from '@/shared/models/shared-product.model'

@Injectable()
export class ProductRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async list({
    categories,
    languageId,
    limit,
    orderBy,
    page,
    sortBy,
    IsPublic,
    name,
    maxPrice,
    minPrice,
  }: {
    limit: number
    page: number
    name?: string
    categories?: number[]
    IsPublic?: boolean
    languageId: string
    orderBy: OrderByType
    sortBy: string
    minPrice?: number
    maxPrice?: number
  }): Promise<GetListProductsResType> {
    const take = limit
    const skip = (page - 1) * limit

    let where: Prisma.ProductWhereInput = {
      deletedAt: null,
    }

    if (IsPublic == true) {
      where.publishedAt = {
        lte: new Date(),
        not: null,
      }
    } else if (IsPublic == false) {
      where = {
        ...where,
        OR: [
          {
            publishedAt: {
              gt: new Date(), //→ lấy sản phẩm có lịch public trong tương lai.
            },
          },
          {
            publishedAt: null, //lấy sản phẩm chưa được set ngày public.
          },
        ],
      }
    }
    if (name) {
      where.name = {
        contains: name,
        mode: 'insensitive', //không phân biệt hoa thường
      }
    }
    if (categories && categories.length > 0) {
      where.categories = {
        some: {
          id: {
            in: categories,
          },
        },
      }
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.basePrice = {
        gte: minPrice,
        lte: maxPrice,
      }
    }

    //Mắc định Sort theo CreatedAt mới nhất
    let caculatedOrderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] = {
      createdAt: orderBy,
    }
    if (sortBy == SortBy.Price) {
      caculatedOrderBy = {
        basePrice: orderBy,
      }
    }
    const [totalItems, data] = await Promise.all([
      this.prismaService.product.count({
        where,
      }),
      this.prismaService.product.findMany({
        where,
        include: {
          skus: true,
          productTranslations: {
            where: languageId == GetAllLanguages ? { deletedAt: null } : { deletedAt: null, languageId },
          },
          categories: {
            include: {
              categoryTranslations: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: caculatedOrderBy,
        skip,
        take,
      }),
    ])
    return {
      data,
      limit: limit,
      page: page,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    } as any
  }

  getDetail({
    languageId,
    productId,
    isPublic,
  }: {
    productId: number
    isPublic?: boolean
    languageId: string
  }): Promise<GetProductDetailType | null> {
    return toMoneyNumbers(this.prismaService.product.findUnique({
      where: {
        id: productId,
        deletedAt: null,
        publishedAt: isPublic ? { lte: new Date(), not: null } : undefined,
      },
      include: {
        productTranslations: {
          where: languageId == GetAllLanguages ? { deletedAt: null } : { deletedAt: null, languageId },
        },
        skus: {
          where: {
            deletedAt: null,
          },
        },

        categories: {
          where: {
            deletedAt: null,
          },
          include: {
            categoryTranslations: {
              where: languageId == GetAllLanguages ? { deletedAt: null } : { deletedAt: null, languageId },
            },
          },
        },
      },
    }))
  }

  findById(productId: number): Promise<ProductType | null> {
    return this.prismaService.product.findUnique({
      where: {
        id: productId,
        deletedAt: null,
      },
    })
  }

  createdById(data: CreateProductBodyType, createdById: number, languageId: string): Promise<GetProductDetailType> {
    const { skus, categories, ...productData } = data

    //Khi 2 bảng liên kết với nhau với mối quan hệ nhiều nhiều
    //chúng ta không cần dùng cú pháp , chúng ta vẫn có thể connect tới categories thông qua product.create

    /**
        Cách dung hòa (Hybrid)

        Nhiều hệ thống thương mại điện tử / F&B sẽ:

        Không lưu stock trực tiếp trong SKU.

        Nhưng có bảng cache (SKUStockCache) để lưu stock đã tính toán sẵn.

        Background job (BullMQ / Cron) sẽ update định kỳ hoặc khi có biến động lớn về nguyên liệu.

        Khi user thêm vào giỏ hoặc order, hệ thống kiểm tra lại real-time để tránh sai lệch.
         */
    return toMoneyNumbers(this.prismaService.product.create({
      data: {
        ...productData,
        createdById,
        categories: {
          connect: categories.map((category) => ({ id: category })),
        },
        skus: {
          createMany: {
            data: skus.map((sku) => {
              return {
                ...sku,
                image: sku.image || '',
                createdById,
              }
            }),
          },
        },
      },
      include: {
        productTranslations: {
          where: languageId == GetAllLanguages ? { deletedAt: null } : { deletedAt: null, languageId },
        },
        skus: {
          where: {
            deletedAt: null,
          },
        },
        categories: {
          where: {
            deletedAt: null,
          },
          include: {
            categoryTranslations: {
              where: languageId == GetAllLanguages ? { deletedAt: null } : { deletedAt: null, languageId },
            },
          },
        },
      },
    }))
  }

  async update({
    id,
    data,
    updatedById,
    languageId,
  }: {
    id: number
    updatedById: number
    data: UpdateProductBodyType
    languageId: string
  }): Promise<GetProductDetailType> {
    /**
     * SKU có trong DB nhưng không có trong data(payload người dùng gửi lên) thì chúng ta sẽ xóa chúng đi
     * SKU có trong DB và nó có luôn trong data của người dùng gửi lên thì tụi nó sẽ được cập nhật
     * SKU mà không tồn tại trong DB nhưng có trong data payload thì chúng sẽ được thêm mới
     */
    const { skus: dataSkus, categories, ...productDataToUpdate } = data

    //1. Lấy ra danh sách SKU hiện tại trong DB
    const existingSkus = await this.prismaService.sKU.findMany({
      where: {
        productId: id,
        deletedAt: null,
      },
    })

    //2. Lấy ra danh sách SKU có trong để Db và không có trong DataSkus để XÓA
    const skusToDelete = existingSkus.filter((sku) => {
      dataSkus.every((dataSku) => dataSku.value !== sku.value)
    })

    const skuIdsToDelete = skusToDelete.map((sku) => sku.id)

    //3. Mapping ID skusToDelete với dataSkus (mục đích là tìm ra các data nào có id thì suy ra có trong db , còn chưa có id thì bắt đầu thêm vào)
    const skusWithId = dataSkus.map((sku) => {
      const existingSku = existingSkus.find((dataSku) => dataSku.value === sku.value)
      return {
        image: sku.image,
        price: sku.price,
        value: sku.value,
        id: existingSku ? existingSku.id : null,
      }
    })
    //4. Lọc ra cac skus để Updat (có trong DB và Data)
    const skusToUpdate = skusWithId.filter((sku) => sku.id !== null)

    //5. Lọc ra các skus chưa có trong DB để bắt đầu thêm vào
    const skusToCreate = skusWithId
      .filter((sku) => sku.id === null)
      .map((sku) => {
        const { id: skuId, ...skuData } = sku
        return {
          ...skuData,
          image: skuData.image || '',
          productId: id,
          createdById: updatedById,
        }
      })
    const now = new Date()
    //Vì chúng ta cập nhật liên tục trong Db , có những trường hợp 1 dòng lệnh bị lỗi trong khi
    //mình đã thay đổi updatemany trong Db thì bị sai , vì thế chúng ta dùng `transaction`
    //Nghĩa là khi 1 dòng lệnh bị lỗi thì chúng sẽ tự trở lại trước khi cập nhật
    //Đầu vào là 1 mảng gồm các giá trị trả về của các method Prisma
    await this.prismaService.$transaction([
      //Xóa mềm các skus
      this.prismaService.sKU.updateMany({
        where: {
          deletedAt: null,
          id: {
            in: skuIdsToDelete,
          },
        },
        data: {
          deletedAt: now,
          deletedById: updatedById,
        },
      }),

      //Cập nhật các sku
      ...skusToUpdate.map((sku) =>
        this.prismaService.sKU.update({
          where: {
            id: sku.id as number,
          },
          data: {
            value: sku.value,
            price: sku.price,
            image: sku.image,
            updatedById,
          },
        }),
      ),

      //Thêm các sku vào
      this.prismaService.sKU.createMany({
        data: skusToCreate,
      }),

      //Cập nhật product
      this.prismaService.product.update({
        where: {
          id,
          deletedAt: null,
        },
        data: {
          ...productDataToUpdate,
          updatedById,
          categories: {
            connect: categories.map((category) => ({ id: category })),
          },
        },
      }),
    ])
    const product = await this.getDetail({
      productId: id,
      isPublic: false,
      languageId: GetAllLanguages,
    })
    return product as GetProductDetailType
  }

  async delete({ deletedById, id }: { id: number; deletedById: number }, isHard?: boolean): Promise<ProductType> {
    if (isHard) {
      return this.prismaService.product.delete({
        where: {
          id,
          deletedAt: null,
        },
      })
    }
    const now = new Date()
    const [, product] = await Promise.all([
      //Cập nhật ProductTranslations
      this.prismaService.productTranslation.updateMany({
        where: {
          deletedAt: null,
          productId: id, //Tại vì mình đánh index productId rồi nên query sẽ rất nhanh
        },
        data: {
          deletedAt: now,
          deletedById,
        },
      }),
      this.prismaService.product.update({
        where: {
          id,
          deletedAt: null,
        },
        data: {
          deletedAt: now,
          deletedById,
        },
      }),
      this.prismaService.sKU.updateMany({
        where: {
          productId: id,
        },
        data: {
          deletedAt: now,
          deletedById,
        },
      }),
    ])
    return product as any
  }
}
