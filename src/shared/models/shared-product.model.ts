import { ProductStatus } from '@/shared/constants/product.constant'
import { z } from 'zod'

export const VariantSchema = z.object({
  value: z.string().trim(),
  valueOption: z.array(
    z.object({
      value: z.string(),
      price: z.number(),
      image: z.string(),
    }),
  ),
})
export const VariantsSchema = z.array(VariantSchema).superRefine((variants, ctx) => {
  // Kiểm tra trùng variant.value
  // const variantValues = variants.map((v) => v.value)
  // const variantSet = new Set(variantValues)
  // if (variantValues.length !== variantSet.size) {
  //   ctx.addIssue({
  //     code: 'custom',
  //     message: 'Danh sách variant có giá trị bị trùng lặp. Vui lòng kiểm tra lại.',
  //   })
  // }

  //Kiểm tra trùng tên value
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i]
    const isExistingVariant = variants.findIndex((x) => x.value.toLowerCase() === variant.value.toLowerCase()) !== i
    if (isExistingVariant) {
      ctx.addIssue({
        code: 'custom',
        message: `Giá trị "${variant.value}" đã tồn tại trong danh sách Variants . Vui lòng kiểm tra lại`,
        path: ['variants'],
      })
    }
  }

  // Kiểm tra trùng option trong từng variant
  variants.forEach((variant) => {
    const options = variant.valueOption
    const optionSet = new Set(options)
    if (options.length !== optionSet.size) {
      ctx.addIssue({
        code: 'custom',
        message: `Variant "${variant.value}" có valueOption bị trùng. Vui lòng kiểm tra lại.`,
      })
    }
  })
})

export const ProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  basePrice: z.number().positive(),
  virtualPrice: z.number().positive(),
  status: z.enum([ProductStatus.ACTIVE, ProductStatus.INACTIVE, ProductStatus.HIDDEN]),
  variants: z.union([VariantsSchema, z.any()]).transform((val) => {
    if (Array.isArray(val)) {
      return val
    }
    if (typeof val === 'object' && val !== null) {
      return Array.isArray(val) ? val : [val]
    }
    return []
  }),
  publishedAt: z.coerce.date().nullable(),
  images: z.array(z.string()),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const ProductSKUSnapshotSchema = z.object({
  id: z.number(),
  productName: z.string(),
  skuValue: z.string(),
  skuId: z.number(),
  orderId: z.number().nullable(),
  createdAt: z.date(),
  image: z.string(),
  productId: z.number().nullable(),
  quantity: z.number(),
  skuPrice: z.number(),
})

export type VariantType = z.infer<typeof VariantSchema>

export type VariantsType = z.infer<typeof VariantsSchema>

export type ProductType = z.infer<typeof ProductSchema>

export type ProductSKUSnapshotType = z.infer<typeof ProductSKUSnapshotSchema>
