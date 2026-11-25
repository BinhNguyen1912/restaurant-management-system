/**
 * Chọn ngôn ngữ cho 1 request: `?lang=` -> header `X-Locale` -> `Accept-Language` -> `vi`.
 *
 * Vì sao phải có lớp này: trước đây code gọi `I18nContext.current()?.lang` của `nestjs-i18n`
 * nhưng module đó chưa từng được cài/đăng ký, nên luôn trả `undefined` và mọi endpoint
 * lặng lẽ trả **tất cả** bản dịch (FE lấy phần tử [0] -> hiển thị sai ngôn ngữ).
 */
export const SUPPORTED_LOCALES = ['vi', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'vi'


/** 'en-US' | 'EN' | 'en_US' | ['en', 'vi'] -> 'en'; rác -> null */
export function normalizeLocale(raw: unknown): Locale | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  // Accept-Language có thể là "en-US,en;q=0.9" -> lấy thẻ đầu tiên, bỏ ";q=..."
  const primary = value
    .split(',')[0]
    ?.split(';')[0]
    ?.trim()
    .toLowerCase()
    .replace('_', '-')
  if (!primary) return null
  const base = primary.split('-')[0]
  return (SUPPORTED_LOCALES as readonly string[]).includes(base) ? (base as Locale) : null
}

/** Ưu tiên tường minh trước (query/header), chỉ đoán theo Accept-Language khi không có gì */
export function resolveLocale(sources: {
  query?: unknown
  header?: unknown
  acceptLanguage?: unknown
}): Locale {
  return (
    normalizeLocale(sources.query) ??
    normalizeLocale(sources.header) ??
    normalizeLocale(sources.acceptLanguage) ??
    DEFAULT_LOCALE
  )
}

type Translation = { languageId: string | null; name?: string | null; description?: string | null }

/**
 * Chọn bản dịch theo thứ tự: ngôn ngữ yêu cầu -> ngôn ngữ mặc định -> bản đầu tiên.
 * `fallback = true` nghĩa là "không phục vụ được ngôn ngữ yêu cầu" (UI hiện nhãn "chưa dịch").
 * Vì nội dung gốc là tiếng Việt nên khi locale = vi thì fallback luôn false.
 */
export function pickTranslation<T extends Translation>(
  translations: T[] | null | undefined,
  locale: Locale,
): { translation: T | null; fallback: boolean } {
  const list = (translations ?? []).filter((item) => item.languageId)
  const exact = list.find((item) => item.languageId === locale)
  if (exact) return { translation: exact, fallback: false }
  const notServed = locale !== DEFAULT_LOCALE
  const fallback = list.find((item) => item.languageId === DEFAULT_LOCALE)
  if (fallback) return { translation: fallback, fallback: notServed }
  // ngôn ngữ mặc định mà không có bản dịch riêng -> dùng luôn cột gốc (vốn là tiếng Việt)
  if (!notServed) return { translation: null, fallback: false }
  // ngôn ngữ khác: thà trả một bản dịch nào đó còn hơn rỗng
  return { translation: list[0] ?? null, fallback: true }
}
