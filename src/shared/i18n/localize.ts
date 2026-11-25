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
 * về đúng 1 phần tử đã chọn — nhờ vậy FE (vốn đọc `productTranslations[0]`) không cần đổi.
 * Không có bản dịch cho ngôn ngữ đó thì giữ nguyên bản gốc + cờ `translationFallback`.
 */
export function localizeProduct<T extends WithTranslations>(product: T, locale: Locale): T & { translationFallback: boolean } {
  const { translation, fallback } = pickTranslation(product.productTranslations, locale)
  const categories = product.categories?.map((category) => {
    const picked = pickTranslation(category.categoryTranslations, locale)
    return picked.translation ? { ...category, name: picked.translation.name } : category
  })

  return {
    ...product,
    name: translation?.name ?? product.name,
    description: translation?.description ?? product.description,
    productTranslations: translation ? [translation] : (product.productTranslations ?? []),
    ...(categories ? { categories } : {}),
    translationFallback: fallback,
  }
}

/** Dùng cho danh mục: `categoryTranslations` -> `name` */
export function localizeCategory<T extends WithTranslations>(category: T, locale: Locale): T & { translationFallback: boolean } {
  const { translation, fallback } = pickTranslation(category.categoryTranslations, locale)
  return {
    ...category,
    name: translation?.name ?? category.name,
    categoryTranslations: translation ? [translation] : (category.categoryTranslations ?? []),
    translationFallback: fallback,
  }
}

/** Áp cho mảng: giữ 1 hàm để mọi endpoint cùng một kiểu fallback */
export const localizeProducts = <T extends WithTranslations>(products: T[], locale: Locale) =>
  products.map((product) => localizeProduct(product, locale))
