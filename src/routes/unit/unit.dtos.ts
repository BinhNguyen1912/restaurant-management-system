import {
  getAllUnitResSchema,
  unitBodyShema,
  unitParamsSchema,
  unitResSchema,
  unitUpdateBodySchema,
} from '@/routes/unit/unit.model'
import { createZodDto } from 'nestjs-zod'

export class UnitBodyDTO extends createZodDto(unitBodyShema) {}

export class UnitResDTO extends createZodDto(unitResSchema) {}

export class UnitUpdateBodyDTO extends createZodDto(unitUpdateBodySchema) {}

export class GetAllUnitResDTO extends createZodDto(getAllUnitResSchema) {}

export class unitParamsDTO extends createZodDto(unitParamsSchema) {}
