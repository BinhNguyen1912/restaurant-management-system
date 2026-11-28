import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { CustomerService } from '@/routes/customer/customer.service'
import {
  CustomerDetailResDTO,
  CustomerListQueryDTO,
  CustomerListResDTO,
  CustomerNoteBodyDTO,
  CustomerNoteResDTO,
  CustomerOpenOrdersResDTO,
  CustomerPointsResDTO,
  CustomerRedeemPointsBodyDTO,
  CustomerRedeemPointsResDTO,
  CustomerReportQueryDTO,
  CustomerReportResDTO,
} from '@/routes/customer/customer.dtos'

/**
 * Hồ sơ khách hàng (CRM).
 *
 * Nhân viên chỉ ĐỌC (tra SĐT khi khách tới), số liệu cắt theo chi nhánh của họ; ghi chú chăm sóc
 * và báo cáo khách mới/quay lại là của ADMIN (khai báo ở `create-permissions.ts`).
 */
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  /** Khách mới / quay lại / tỉ lệ quay lại / top chi tiêu — khai báo TRƯỚC `:id` để không bị route động nuốt. */
  @Get('report/overview')
  @ZodSerializerDto(CustomerReportResDTO)
  async report(@Query() query: CustomerReportQueryDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.customerService.report(query, user)
  }

  @Get()
  @ZodSerializerDto(CustomerListResDTO)
  async list(@Query() query: CustomerListQueryDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.customerService.list(query, user)
  }

  @Get(':id')
  @ZodSerializerDto(CustomerDetailResDTO)
  async detail(@Param('id', ParseIntPipe) id: number, @ActiveUser() user: AccessTokenPayload) {
    return await this.customerService.detail(id, user)
  }

  /** Số dư điểm + lịch sử kiếm/đổi điểm của một khách. */
  @Get(':id/points')
  @ZodSerializerDto(CustomerPointsResDTO)
  async points(@Param('id', ParseIntPipe) id: number) {
    return await this.customerService.points(id)
  }

  /** Đơn còn trừ được điểm (chưa thu tiền, có dòng món) — danh sách để chọn khi đổi điểm. */
  @Get(':id/open-orders')
  @ZodSerializerDto(CustomerOpenOrdersResDTO)
  async openOrders(@Param('id', ParseIntPipe) id: number, @ActiveUser() user: AccessTokenPayload) {
    return await this.customerService.openOrders(id, user)
  }

  /**
   * Đổi điểm thành giảm giá trên hoá đơn chưa thu tiền của chính khách đó — quầy thu ngân làm
   * thay khách, nên STAFF có quyền POST ở đây (xem `create-permissions.ts`).
   */
  @Post(':id/points/redeem')
  @ZodSerializerDto(CustomerRedeemPointsResDTO)
  async redeemPoints(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CustomerRedeemPointsBodyDTO,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return await this.customerService.redeemPoints(id, body, user)
  }

  @Patch(':id/note')
  @ZodSerializerDto(CustomerNoteResDTO)
  async updateNote(@Param('id', ParseIntPipe) id: number, @Body() body: CustomerNoteBodyDTO) {
    return await this.customerService.updateNote(id, body.note)
  }
}
