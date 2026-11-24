import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { Controller, Post, Body } from '@nestjs/common'
import { DashboardIndicatorService } from '@/routes/dashboard/dashboard-indicator.service'
import { DashboardIndicatorQueryDTO, DashboardIndicatorResponseDTO } from '@/routes/dashboard/dashboard-indicator.dto'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardIndicatorService: DashboardIndicatorService) {}

  @Post('indicator')
  @ZodSerializerDto(DashboardIndicatorResponseDTO)
  async getDashboardIndicator(@Body() query: DashboardIndicatorQueryDTO, @ActiveUser('userId') userId: number) {
    return await this.dashboardIndicatorService.getDashboardIndicator(query, userId)
  }
}
