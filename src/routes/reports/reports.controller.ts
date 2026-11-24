import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { ReportsService } from '@/routes/reports/reports.service'
import {
  RecomputeDTO,
  RecomputeResDTO,
  ReportRangeDTO,
  RevenueByItemResDTO,
  RevenueReportResDTO,
} from '@/routes/reports/reports.dtos'

/**
 * Báo cáo tài chính (ADMIN; nhân viên chỉ đọc được chi nhánh của mình — fail closed ở policy).
 * Mọi số liệu đọc từ projection đã sinh từ sổ cái, không cộng Order runtime.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** Bảng doanh thu theo (ngày, chi nhánh) + tổng + theo phương thức */
  @Get('revenue')
  @ZodSerializerDto(RevenueReportResDTO)
  async revenue(@Query() query: ReportRangeDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.reportsService.revenue(query, user)
  }

  /** Doanh thu theo món trong kỳ (nguồn: đơn đã thu tiền, giá snapshot) */
  @Get('revenue/by-item')
  @ZodSerializerDto(RevenueByItemResDTO)
  async byItem(@Query() query: ReportRangeDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.reportsService.revenueByItem(query, user)
  }

  /** Tính lại projection cho 1 kỳ (chạy tay; cron vẫn chạy hằng ngày) */
  @Post('revenue/recompute')
  @ZodSerializerDto(RecomputeResDTO)
  async recompute(@Body() body: RecomputeDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.reportsService.recompute(body, user)
  }
}
