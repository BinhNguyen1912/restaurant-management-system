import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { DashboardIndicatorService } from '@/routes/dashboard/dashboard-indicator.service'
import { DashboardIndicatorQueryDTO, DashboardIndicatorResponseDTO } from '@/routes/dashboard/dashboard-indicator.dto'
import { DashboardOverviewResDTO, ReportRangeDTO } from '@/routes/reports/reports.dtos'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardIndicatorService: DashboardIndicatorService) {}

  /** Tổng quan: doanh thu, sau thuế, số hoá đơn, trả hàng + % so kỳ trước / cùng kỳ tháng trước */
  @Get('overview')
  @ZodSerializerDto(DashboardOverviewResDTO)
  async overview(@Query() query: ReportRangeDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.dashboardIndicatorService.getOverview(query, {
      userId: user.userId,
      roleName: user.roleName,
    })
  }

  @Post('indicator')
  @ZodSerializerDto(DashboardIndicatorResponseDTO)
  async getDashboardIndicator(@Body() query: DashboardIndicatorQueryDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.dashboardIndicatorService.getDashboardIndicator(query, user)
  }
}
