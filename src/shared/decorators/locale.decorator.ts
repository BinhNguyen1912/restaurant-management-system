import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Locale, resolveLocale } from '@/shared/i18n/locale'

/**
 * `@Locale()` -> 'vi' | 'en' của request hiện tại.
 * Thứ tự: `?lang=` -> header `X-Locale` -> `Accept-Language` -> 'vi'.
 */
export const LocaleParam = createParamDecorator((_data: unknown, ctx: ExecutionContext): Locale => {
  const request = ctx.switchToHttp().getRequest()
  return resolveLocale({
    query: request.query?.lang,
    header: request.headers?.['x-locale'],
    acceptLanguage: request.headers?.['accept-language'],
  })
})
