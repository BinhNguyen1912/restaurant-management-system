export const ProductStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  HIDDEN: 'HIDDEN',
} as const

/**
 * Ngôn ngữ mặc định khi tạo/ cập nhật sản phẩm.
 * I18nModule hiện chưa được đăng ký nên I18nContext.current() luôn undefined,
 * cần fallback về 'vi' để productTranslations luôn được ghi (trước đây translation luôn rỗng).
 */
export const DEFAULT_PRODUCT_LANGUAGE = 'vi'

export type ProductStatusValues = (typeof ProductStatus)[keyof typeof ProductStatus]
