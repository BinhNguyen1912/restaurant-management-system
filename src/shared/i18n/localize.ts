import { Locale, pickTranslation } from '@/shared/i18n/locale'

type WithTranslations = {
  name?: string | null
  description?: string | null
  productTranslations?: Array<{ languageId: string | null; name: string; description?: string | null }> | null
  categoryTranslations?: Array<{ languageId: string | null; name: string }> | null
  categories?: Array<{ name?: string | null; categoryTranslations?: Array<{ languageId: string | null; name: string }> | null }>
}

/**
 * Ghi đè `name`/`description` bằng bản dịch của ngôn ngữ đang xét, và thu `productTranslations`
 * về đúng 1 phần tử đã chọn (không có thì rỗng) — FE vốn đọc `productTranslations[0]` nên không
 * phải đổi, và FE biết "chưa dịch" khi mảng rỗng.
 *
 * KHÔNG trả bản dịch của ngôn ngữ khác: trước đây mảng rỗng thì trả nguyên cả mảng, khiến khách
 * xem tiếng Việt thấy mô tả tiếng Anh.
 */
export function localizeProduct<T extends WithTranslations>(product: T, locale: Locale): T {
  const { translation } = pickTranslation(product.productTranslations, locale)
  const categories = product.categories?.map((category) => {
    const picked = pickTranslation(category.categoryTranslations, locale)
    return {
      ...category,
      name: picked.translation?.name ?? category.name,
      ...(category.categoryTranslations
        ? { categoryTranslations: picked.translation ? [picked.translation] : [] }
        : {}),
    }
  })

  return {
    ...product,
    name: translation?.name ?? product.name,
    description: translation?.description ?? product.description,
    productTranslations: translation ? [translation] : [],
    ...(categories ? { categories } : {}),
  }
}

/** Dùng cho danh mục: `categoryTranslations` -> `name` (mảng rỗng = chưa có bản dịch) */
export function localizeCategory<T extends WithTranslations>(category: T, locale: Locale): T {
  const { translation } = pickTranslation(category.categoryTranslations, locale)
  return {
    ...category,
    name: translation?.name ?? category.name,
    categoryTranslations: translation ? [translation] : [],
  }
}

/** Áp cho mảng: giữ 1 hàm để mọi endpoint cùng một kiểu fallback */
export const localizeProducts = <T extends WithTranslations>(products: T[], locale: Locale) =>
  products.map((product) => localizeProduct(product, locale))
