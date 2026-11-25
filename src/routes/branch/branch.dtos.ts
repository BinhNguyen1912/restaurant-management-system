import { createZodDto } from 'nestjs-zod'
import {
  BranchBodySchema,
  BranchListResSchema,
  BranchParamSchema,
  UpdateBranchBodySchema,
  UpdateBranchSettingsSchema,
} from '@/routes/branch/branch.model'

export class BranchParamDTO extends createZodDto(BranchParamSchema) {}
export class UpdateBranchSettingsDTO extends createZodDto(UpdateBranchSettingsSchema) {}
export class BranchListResDTO extends createZodDto(BranchListResSchema) {}

export class BranchBodyDTO extends createZodDto(BranchBodySchema) {}
export class UpdateBranchBodyDTO extends createZodDto(UpdateBranchBodySchema) {}
