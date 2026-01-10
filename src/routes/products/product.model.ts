import { UpsertSKUBody, UpsertSKUBodySchema } from '@/routes/products/sku.model'
import { OrderBy, SortBy } from '@/shared/constants/others.constant'
import { CategoryIncludeTranslationSchema } from '@/shared/models/shared-category.model'
import { ProductTranslationSchema } from '@/shared/models/shared-product-translation.model'
import { ProductSchema, VariantType } from '@/shared/models/shared-product.model'
import { SKUSchema } from '@/shared/models/shared-sku.model'
import { UserSchema } from '@/shared/models/shared-user.model'
import { create } from 'domain'
import z from 'zod'
///GỐC NÈ
// export function GenerateSKU(variants: VariantType[], prop?: { basePrice: number; image: string }): UpsertSKUBody[] {
//   function getCombine(
//     arr: {
//       value: string
//       price: number
//       image: string
//     }[][],
//   ): {
//     value: string
//     price: number
//     image: string
//   }[] {
//     const result = arr.reduce(
//       (acc, curr) =>
//         acc.flatMap((x) =>
//           curr.map(({ image, price, value }) =>
//             x.value ? { value: `${x.value}-${value}`, price, image } : { value: `${value}`, price, image },
//           ),
//         ),
//       [
//         {
//           value: '',
//           price: 0,
//           image: '',
//         },
//       ],
//     )
//     return result
//   }

//   // Bước 1: Lấy danh sách valueOption của từng Varient
//   const options = variants.map((variant) => variant.valueOption)
//   // if (options.length === 0) {
//   //   options = [[{ value: 'Nguyên bản -', price: prop?.basePrice as number, image: prop?.image as string }]]
//   // }
//   // console.log('options', options)

//   // Bước 2: Sinh tổ hợp SKU value
//   const SKUValues = getCombine(options)

//   // Bước 3: Map thành mảng SKU với giá trị mặc định
//   const skus: UpsertSKUBodyType[] = SKUValues.map((value) => ({
//     image: value.image,
//     price: value.price,
//     value: value.value,
//   }))

//   return skus
// }

//MỚI THAY
export function GenerateSKU(variants: VariantType[], prop?: { basePrice: number; image: string }): UpsertSKUBody[] {
  function getCombine(
    arr: {
      value: string
      price: number
      image?: string
    }[][],
  ): {
    value: string
    price: number
    image?: string
  }[] {
    const result = arr.reduce(
      (acc, curr) =>
        acc.flatMap((x) =>
          curr.map(({ image, price, value }) =>
            x.value ? { value: `${x.value}-${value}`, price, image } : { value: `${value}`, price, image },
          ),
        ),
      [
        {
          value: '',
          price: 0,
          image: '',
        },
      ],
    )
    return result
  }

  // Bước 1: Lấy danh sách valueOption của từng Varient
  const options = variants.map((variant) => variant.valueOption)
  // if (options.length === 0) {
  //   options = [[{ value: 'Nguyên bản -', price: prop?.basePrice as number, image: prop?.image as string }]]
  // }
  // console.log('options', options)

  // Bước 2: Sinh tổ hợp SKU value
  const SKUValues = getCombine(options)

  // Bước 3: Map thành mảng SKU với giá trị mặc định
  const skus: UpsertSKUBodyType[] = SKUValues.map((value) => ({
    image: value.image,
    price: value.price,
    value: value.value,
  }))

  return skus
}
/**
 * Dành cho Client và Guest và Staff
 */
export const GetProductQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(10),
  page: z.coerce.number().int().positive().default(1),
  name: z.string().optional(),
  categories: z.array(z.coerce.number().int().positive()).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  createdById: z.coerce.number().int().positive().optional(),
  orderBy: z.enum([OrderBy.Asc, OrderBy.Desc]).default(OrderBy.Asc),
  sortBy: z.enum([SortBy.CreatedAt, SortBy.Sale, SortBy.Price]).default(SortBy.CreatedAt),
}) //phu vu chuc nang filter

/**
 * Dành cho Admin , Manage
 */
export const GetManageProductQuerySchema = GetProductQuerySchema.extend({
  //boolean trong prerocess là yêu cầu đầu vào có kiểu là z.boolean
  isPublic: z.preprocess((value) => value === 'true', z.boolean()).optional(), //Vì  manager có thể xem được các sản phẩm chưa được đăng tải
})

export const GetProductsResSchema = z
  .object({
    data: z.array(
      ProductSchema.extend({
        productTranslations: z.array(ProductTranslationSchema),
        skus: z.array(SKUSchema),
        categories: z.array(CategoryIncludeTranslationSchema),
        createdBy: UserSchema.pick({
          id: true,
          name: true,
        }).nullable(),
      }),
    ),
    totalItems: z.number(),
    totalPages: z.number(),
    page: z.number(),
    limit: z.number(),
  })
  .strict()

export const GetProductParamSchema = z
  .object({
    productId: z.coerce.number().positive(),
  })
  .strict()
export const GetProductDetailSchema = ProductSchema.extend({
  productTranslations: z.array(ProductTranslationSchema),
  skus: z.array(SKUSchema),
  categories: z.array(CategoryIncludeTranslationSchema),
})

//BẢN GỐC
// export const CreateProductBodySchema = ProductSchema.pick({
//   basePrice: true,
//   virtualPrice: true,
//   name: true,
//   variants: true,
//   publishedAt: true,
//   images: true,
// })
//   .extend({
//     categories: z.array(z.coerce.number().int().positive()),
//     skus: z.array(UpsertSKUBodySchema),
//   })
//   .strict()
//   .superRefine(({ variants, skus, basePrice, images }, ctx) => {
//     //Kiểm tra xem số lượng sku có hợp lệ không
//     if (skus.length === 0) {
//       skus = GenerateSKU([])
//     }
//     const skuValueArray = GenerateSKU(variants, { basePrice, image: images[0] })
//     console.log('skuValueArray', skuValueArray)

//     if (skus.length !== skuValueArray.length) {
//       return ctx.addIssue({
//         code: 'custom',
//         path: ['skus'],
//         message: `Số lượng SKUS nên là ${skuValueArray.length}. Vùi lòng kiểm tra lại`,
//       })
//     }

//     //kiểm tra xem từng Sku có hợp lệ hay không
//     let wrongSKUIndex = -1
//     const isValidSKUs = skus.every((sku, index) => {
//       const inValid = sku.value == skuValueArray[index].value
//       if (!inValid) wrongSKUIndex = index
//       return inValid
//     })

//     if (!isValidSKUs) {
//       return ctx.addIssue({
//         code: 'custom',
//         path: ['skus', wrongSKUIndex],
//         message: `Giá trị SKU index ${wrongSKUIndex} không hợp lệ. Vui lòng kiểm tra lại `,
//       })
//     }
//   })

export const UpdateProductBodySchema = ProductSchema.pick({
  basePrice: true,
  virtualPrice: true,
  name: true,
  variants: true,
  publishedAt: true,
  images: true,
})
  .extend({
    categories: z.array(z.coerce.number().int().positive()),
    skus: z.array(UpsertSKUBodySchema),
  })
  .strict()
  .superRefine(({ variants, skus, basePrice, images, name }, ctx) => {
    if (variants.length === 0) {
      if (skus.length !== 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['skus'],
          message: `Khi không có variants, cần đúng 1 SKU kế thừa từ sản phẩm gốc`,
        })
        return
      }

      const expectedSku = {
        value: name,
        price: basePrice,
        image: images[0] ?? '',
      }

      const sku = skus[0]
      if (sku.value !== expectedSku.value) {
        ctx.addIssue({
          code: 'custom',
          path: ['skus', 0, 'value'],
          message: `SKU phải có value = "${expectedSku.value}"`,
        })
      }
      return
    }

    // ✅ Trường hợp có variants → kiểm tra generate
    const generatedSkus = GenerateSKU(variants, {
      basePrice,
      image: images[0],
    })

    if (skus.length !== generatedSkus.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['skus'],
        message: `Cần có ${generatedSkus.length} SKUs khi có variants. Vui lòng kiểm tra lại`,
      })
      return
    }

    // check từng SKU
    skus.forEach((sku, index) => {
      if (sku.value !== generatedSkus[index].value) {
        ctx.addIssue({
          code: 'custom',
          path: ['skus', index, 'value'],
          message: `SKU index ${index} không khớp với variants. Expected "${generatedSkus[index].value}"`,
        })
      }
    })
  })

export const CreateProductBodySchema = ProductSchema.pick({
  basePrice: true,
  virtualPrice: true,
  name: true,
  variants: true,
  publishedAt: true,
  images: true,
})
  .extend({
    categories: z.array(z.coerce.number().int().positive()),
    skus: z.array(UpsertSKUBodySchema),
  })
  .strict()
  .superRefine(({ variants, skus, basePrice, images }, ctx) => {
    //Kiểm tra xem số lượng sku có hợp lệ không
    if (skus.length === 0) {
      const generatedSkus = GenerateSKU(variants, {
        basePrice,
        image: images[0],
      })
      if (generatedSkus.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['skus'],
          message: `Số lượng SKUS nên là ${generatedSkus.length}. Vùi lòng kiểm tra lại`,
        })
      }
      return
    }

    const skuValueArray = GenerateSKU(variants, {
      basePrice,
      image: images[0],
    })

    if (skus.length !== skuValueArray.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['skus'],
        message: `Số lượng SKUS nên là ${skuValueArray.length}. Vùi lòng kiểm tra lại`,
      })
      return
    }

    //kiểm tra xem từng Sku có hợp lệ hay không
    let wrongSKUIndex = -1
    const isValidSKUs = skus.every((sku, index) => {
      const isValid = sku.value === skuValueArray[index].value
      if (!isValid) wrongSKUIndex = index
      return isValid
    })

    if (!isValidSKUs) {
      ctx.addIssue({
        code: 'custom',
        path: ['skus', wrongSKUIndex],
        message: `Giá trị SKU index ${wrongSKUIndex} không hợp lệ. Vui lòng kiểm tra lại `,
      })
    }
  })

export type UpsertSKUBodyType = z.infer<typeof UpsertSKUBodySchema>

export type CreateProductBodyType = z.infer<typeof CreateProductBodySchema>

export type UpdateProductBodyType = z.infer<typeof UpdateProductBodySchema>

export type GetProductQueryType = z.infer<typeof GetProductQuerySchema>

export type GetProductDetailType = z.infer<typeof GetProductDetailSchema>

export type GetListProductsResType = z.infer<typeof GetProductsResSchema>

export type GetProductParamType = z.infer<typeof GetProductParamSchema>

export type GetManageProductQueryType = z.infer<typeof GetManageProductQuerySchema>
