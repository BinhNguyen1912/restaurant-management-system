import {
  areaBodySchema,
  areaParamsSchema,
  areaResSchema,
  getListAreaResSchema,
  getQueryAreaSchema,
  updateAreaBodySchema,
} from '@/routes/area/area.model'
import { createZodDto } from 'nestjs-zod'

export class AreaBodyDTO extends createZodDto(areaBodySchema) {}

export class UpdateAreaBodyDTO extends createZodDto(updateAreaBodySchema) {}

export class AreaParamsDTO extends createZodDto(areaParamsSchema) {}

export class ListAreaResDTO extends createZodDto(getListAreaResSchema) {}

export class AreaResDTO extends createZodDto(areaResSchema) {}

export class AreaQueryDTO extends createZodDto(getQueryAreaSchema) {}

// export class AreaDetailResDTO extends createZodDto(areaResSchema) { }
