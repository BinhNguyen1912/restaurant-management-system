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
/**
 * Sinh danh sách SKU từ biến thể.
 * Không có biến thể => KHÔNG sinh SKU nào (SKU mặc định do service tạo từ name + basePrice).
 * Trước đây hàm này trả về 1 phần tử rỗng { value: '' } khi variants = [] khiến schema
 * luôn báo lỗi "Giá trị SKU index 0 không hợp lệ" cho mọi sản phẩm không có biến thể.
 */
export function GenerateSKU(variants: VariantType[], prop?: { basePrice: number; image: string }): UpsertSKUBody[] {
  if (!variants || variants.length === 0) return []

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

/** Tên món: bắt buộc, 2-100 ký tự (Product.name ở DB là VarChar 500 nhưng hiển thị UI chỉ hợp lý tới 100) */
export const ProductNameInputSchema = z
  .string()
  .trim()
  .min(2, 'Tên món phải có ít nhất 2 ký tự')
  .max(100, 'Tên món tối đa 100 ký tự')

/** Ảnh sản phẩm: phải là URL http(s) thật (chặn blob: do upload thất bại nhưng vẫn gửi lên) */
/**
 * Ảnh sản phẩm.
 *
 * Lọc BỎ chuỗi rỗng TRƯỚC khi validate: `catalog.seed` cũ ghi `images: ['']` (chỗ giữ chỗ cho ảnh
 * demo), và FE gửi lại nguyên mảng đó khi admin sửa sản phẩm → `''` không phải URL nên cả request
 * **400 "Ảnh phải là URL http(s) hợp lệ"**. Tức là sản phẩm seed **không sửa được** dù người dùng
 * không đụng vào ảnh. Lọc ở đây sửa được cả dữ liệu cũ lẫn dữ liệu mới.
 */
export const ProductImagesInputSchema = z
  .array(z.string().trim())
  .transform((list) => list.filter((url) => url.length > 0))
  .pipe(
    z
      .array(
        z
          .string()
          .regex(/^https?:\/\/.+/i, 'Ảnh phải là URL http(s) hợp lệ')
          .max(500, 'URL ảnh quá dài'),
      )
      .max(10, 'Tối đa 10 ảnh'),
  )

export const ProductDescriptionInputSchema = z.string().trim().max(500, 'Mô tả tối đa 500 ký tự').default('')

export const UpdateProductBodySchema = ProductSchema.pick({
  basePrice: true,
  virtualPrice: true,
  name: true,
  variants: true,
  publishedAt: true,
  images: true,
})
  .extend({
    name: ProductNameInputSchema,
    images: ProductImagesInputSchema,
    // Update: mô tả không bắt buộc — không gửi thì giữ nguyên mô tả cũ
    description: z.string().trim().max(500, 'Mô tả tối đa 500 ký tự').optional(),
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
    name: ProductNameInputSchema,
    images: ProductImagesInputSchema,
    description: ProductDescriptionInputSchema,
    categories: z.array(z.coerce.number().int().positive()),
    skus: z.array(UpsertSKUBodySchema),
  })
  .strict()
  .superRefine(({ variants, skus, basePrice, images, name }, ctx) => {
    // Không có biến thể: service tự tạo 1 SKU mặc định từ name + basePrice.
    // Client có thể gửi 0 hoặc 1 SKU; nếu gửi 1 SKU thì value phải = tên món.
    if (variants.length === 0) {
      if (skus.length > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['skus'],
          message: 'Sản phẩm không có biến thể chỉ cần 1 SKU mặc định',
        })
        return
      }
      if (skus.length === 1 && skus[0].value !== '' && skus[0].value !== name) {
        ctx.addIssue({
          code: 'custom',
          path: ['skus', 0, 'value'],
          message: `Khi không có biến thể, SKU phải có value = "${name}"`,
        })
      }
      return
    }

    // Có biến thể: mọi tổ hợp biến thể phải được sinh đủ SKU, đúng thứ tự
    const skuValueArray = GenerateSKU(variants, {
      basePrice,
      image: images[0],
    })

    if (skus.length !== skuValueArray.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['skus'],
        message: `Cần ${skuValueArray.length} SKU theo biến thể, đang có ${skus.length}. Vui lòng kiểm tra lại`,
      })
      return
    }

    const wrongSKUIndex = skus.findIndex((sku, index) => sku.value !== skuValueArray[index].value)
    if (wrongSKUIndex !== -1) {
      ctx.addIssue({
        code: 'custom',
        path: ['skus', wrongSKUIndex, 'value'],
        message: `Giá trị SKU index ${wrongSKUIndex} không hợp lệ. Vui lòng kiểm tra lại`,
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
