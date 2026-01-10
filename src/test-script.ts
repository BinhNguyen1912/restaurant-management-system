import { UpsertSKUBodyType } from '@/routes/products/product.model'
import { UpsertSKUBody } from '@/routes/products/sku.model'
import { VariantType } from '@/shared/models/shared-product.model'

const varients: VariantType[] = [
  {
    value: 'size',
    valueOption: [
      {
        image: '',
        price: 30000,
        value: 'M',
      },
      {
        image: '',
        price: 40000,
        value: 'L',
      },
    ],
  },
]
export function GenerateSKU(variants: VariantType[], prop?: { basePrice: number; image: string }): UpsertSKUBody[] {
  console.log('variants at product modle', variants)

  function getCombine(
    arr: {
      value: string
      price: number
      image: string
    }[][],
  ): {
    value: string
    price: number
    image: string
  }[] {
    console.log('arr', arr)

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
  console.log('SKUValues', SKUValues)

  // Bước 3: Map thành mảng SKU với giá trị mặc định
  const skus: UpsertSKUBodyType[] = SKUValues.map((value) => ({
    image: value.image,
    price: value.price,
    value: value.value,
  }))

  return skus
}

console.log(JSON.stringify(GenerateSKU(varients)))
