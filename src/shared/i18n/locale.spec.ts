import { DEFAULT_LOCALE, isAllLanguages, normalizeLocale, pickTranslation, resolveLocale } from '@/shared/i18n/locale'
import { localizeCategory, localizeProduct } from '@/shared/i18n/localize'

describe('locale', () => {
  it('chuẩn hoá mã ngôn ngữ từ nhiều nguồn', () => {
    expect(normalizeLocale('en')).toBe('en')
    expect(normalizeLocale('EN')).toBe('en')
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('vi_VN')).toBe('vi')
    expect(normalizeLocale('en-US,en;q=0.9')).toBe('en')
    expect(normalizeLocale(['en', 'vi'])).toBe('en')
    expect(normalizeLocale('all')).toBeNull()
    expect(normalizeLocale('fr')).toBeNull()
    expect(normalizeLocale(undefined)).toBeNull()
    expect(normalizeLocale('')).toBeNull()
  })

  it('ưu tiên query -> header -> accept-language -> mặc định', () => {
    expect(resolveLocale({ query: 'en', header: 'vi', acceptLanguage: 'vi' })).toBe('en')
    expect(resolveLocale({ header: 'en', acceptLanguage: 'vi' })).toBe('en')
    expect(resolveLocale({ acceptLanguage: 'en-GB,en;q=0.8' })).toBe('en')
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE)
    expect(resolveLocale({ query: 'fr', header: 'fr' })).toBe(DEFAULT_LOCALE)
    expect(isAllLanguages('all')).toBe(true)
    expect(isAllLanguages('ALL')).toBe(true)
    expect(isAllLanguages('en')).toBe(false)
  })

  it('chọn bản dịch: đúng ngôn ngữ -> mặc định (fallback) -> bản đầu tiên', () => {
    const translations = [
      { languageId: 'vi', name: 'Phở bò' },
      { languageId: 'en', name: 'Beef noodle soup' },
    ]
    expect(pickTranslation(translations, 'en')).toEqual({ translation: translations[1], fallback: false })
    expect(pickTranslation(translations, 'vi')).toEqual({ translation: translations[0], fallback: false })

    const viOnly = [{ languageId: 'vi', name: 'Phở bò' }]
    expect(pickTranslation(viOnly, 'en')).toEqual({ translation: viOnly[0], fallback: true })
    expect(pickTranslation([], 'en')).toEqual({ translation: null, fallback: true })
    expect(pickTranslation([], 'vi')).toEqual({ translation: null, fallback: false })
    expect(pickTranslation(null, 'en')).toEqual({ translation: null, fallback: true })
    expect(pickTranslation([{ languageId: null, name: 'rác' }], 'en')).toEqual({ translation: null, fallback: true })
    // vi là ngôn ngữ gốc: không có bản dịch riêng thì dùng cột name, không mượn bản dịch en
    expect(pickTranslation([{ languageId: 'en', name: 'Beef' }], 'vi')).toEqual({ translation: null, fallback: false })
    // ngôn ngữ khác: mượn bản dịch có sẵn và báo fallback
    expect(pickTranslation([{ languageId: 'fr', name: 'Boeuf' }], 'en')).toEqual({
      translation: { languageId: 'fr', name: 'Boeuf' },
      fallback: true,
    })
  })

  it('localizeProduct ghi đè tên/mô tả và thu bản dịch về 1 phần tử', () => {
    const product = {
      id: 1,
      name: 'Phở bò',
      description: 'mô tả vi',
      productTranslations: [
        { languageId: 'vi', name: 'Phở bò', description: 'mô tả vi' },
        { languageId: 'en', name: 'Beef noodle soup', description: 'en desc' },
      ],
      categories: [
        { id: 4, name: 'Món chính', categoryTranslations: [{ languageId: 'en', name: 'Main dishes' }] },
      ],
    }
    const en = localizeProduct(product, 'en')
    expect(en.name).toBe('Beef noodle soup')
    expect(en.description).toBe('en desc')
    expect(en.productTranslations).toHaveLength(1)
    expect(en.productTranslations[0].languageId).toBe('en')
    expect(en.categories?.[0].name).toBe('Main dishes')
    expect(en.translationFallback).toBe(false)

    const viOnly = localizeProduct({ id: 2, name: 'Cơm', productTranslations: [{ languageId: 'vi', name: 'Cơm' }] }, 'en')
    expect(viOnly.name).toBe('Cơm')
    expect(viOnly.translationFallback).toBe(true)
  })

  it('localizeCategory ghi đè tên theo ngôn ngữ, thiếu thì fallback', () => {
    const category = {
      id: 3,
      name: 'Khai vị',
      categoryTranslations: [
        { languageId: 'vi', name: 'Khai vị' },
        { languageId: 'en', name: 'Starters' },
      ],
    }
    expect(localizeCategory(category, 'en').name).toBe('Starters')
    expect(localizeCategory({ id: 4, name: 'Tráng miệng', categoryTranslations: [] }, 'en')).toMatchObject({
      name: 'Tráng miệng',
      translationFallback: true,
    })
  })
})
