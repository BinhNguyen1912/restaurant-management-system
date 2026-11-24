import { createZodDto } from 'nestjs-zod'
import {
  BranchListResSchema,
  BranchParamSchema,
  UpdateBranchSettingsSchema,
} from '@/routes/branch/branch.model'

export class BranchParamDTO extends createZodDto(BranchParamSchema) {}
export class UpdateBranchSettingsDTO extends createZodDto(UpdateBranchSettingsSchema) {}
export class BranchListResDTO extends createZodDto(BranchListResSchema) {}
