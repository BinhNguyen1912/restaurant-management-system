import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { BranchService } from '@/routes/branch/branch.service'
import { BranchListResDTO, BranchParamDTO, UpdateBranchSettingsDTO } from '@/routes/branch/branch.dtos'

@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Get()
  @ZodSerializerDto(BranchListResDTO)
  async list() {
    return await this.branchService.list()
  }

  /** Cấu hình VAT / phí phục vụ — chỉ ADMIN (xem create-permissions.ts) */
  @Put(':id/settings')
  async updateSettings(@Param() params: BranchParamDTO, @Body() body: UpdateBranchSettingsDTO) {
    return await this.branchService.updateSettings(params.id, body)
  }
}
