import {
  getAllUnitConversionResSchema,
  unitConversionBodyShema,
  unitConversionParamsSchema,
  unitConversionResSchema,
  unitConversionUpdateBodySchema,
} from '@/routes/unitConversion/unitConversion.model'
import { createZodDto } from 'nestjs-zod'

export class UnitConversionBodyDTO extends createZodDto(unitConversionBodyShema) {}

export class UnitConversionResDTO extends createZodDto(unitConversionResSchema) {}

export class UnitConversionUpdateBodyDTO extends createZodDto(unitConversionUpdateBodySchema) {}

export class GetAllUnitConversionResDTO extends createZodDto(getAllUnitConversionResSchema) {}

export class unitConversionParamsDTO extends createZodDto(unitConversionParamsSchema) {}
