import {
  GetAllLanguageResSchema,
  getLanguageIncludeCreateByShema,
  LanguageBodySchema,
  LanguageResSchema,
  UpdateLanguageBodySchema,
} from '@/routes/language/language.model'
import { createZodDto } from 'nestjs-zod'

export class LanguageBodyDTO extends createZodDto(LanguageBodySchema) {}
export class LanguageResDTO extends createZodDto(LanguageResSchema) {}
export class UpdateLanguageBodyDTO extends createZodDto(UpdateLanguageBodySchema) {}
export class GetAllLanguageResDTO extends createZodDto(GetAllLanguageResSchema) {}
export class getLanguageIncludeCreateByDTO extends createZodDto(getLanguageIncludeCreateByShema) {}
