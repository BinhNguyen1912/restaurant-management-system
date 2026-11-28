import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { LogAccess } from '@/shared/decorators/access-log.decorator'
import {
  CategoryBodyDTO,
  CategoryResDTO,
  getAllCategoryDTO,
  getCategoryDetailDTO,
  getCategoryParamDTO,
  GetCategoryQueryDTO,
  UpdateCategoryBodyDTO,
} from '@/routes/categories/category.dtos'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { CategoryService } from '@/routes/categories/category.service'
import { GuestService } from '@/routes/guest/guest.service'
import {
  GuestCreateNewOrderDTO,
  GuestLoginBodyDTO,
  GuestLoginResDTO,
  GuestParamsRefeshTokenDTO,
  GuestOrdersQueryDTO,
  GuestOrdersListDTO,
  GuestListQueryDTO,
  GuestListDTO,
  CallStaffDTO,
} from '@/routes/guest/guest.dtos'
import { IsPublic } from '@/shared/decorators/auth.decorator'
import { EmptyBodyDTO } from '@/shared/dtos/respone.dto'
import { AccessTokenPayload } from '@/shared/types/jwt.types'

@Controller('guest')
export class GuestController {
  constructor(private readonly guestService: GuestService) {}

  @Post('login')
  @IsPublic()
  @ZodSerializerDto(GuestLoginResDTO)
  async create(@Body() body: GuestLoginBodyDTO) {
    const data = await this.guestService.login(body)
    return data
  }

  @Post('logout')
  async logout(@Body() body: EmptyBodyDTO, @ActiveUser('userId') guestId: number) {
    return await this.guestService.logout({ guestId })
  }

  /**
   * Đổi refresh token lấy access token mới. Public vì đây chính là endpoint dùng khi access
   * token ĐÃ hết hạn; chỉ dựa vào refresh token (đối chiếu DB trong repo), không dựa vào AT.
   */
  @Post('refreshToken')
  @IsPublic()
  async refreshToken(@Body() body: GuestParamsRefeshTokenDTO) {
    return await this.guestService.GetNewAccessToken({
      refreshToken: body.refreshToken,
    })
  }
  @Post('new-order')
  async createOrder(
    @Body() createOrderDto: GuestCreateNewOrderDTO,
    @ActiveUser('userId') userId: number,
    /** mã voucher (tuỳ chọn) — body vẫn là mảng món để không phá client cũ */
    @Query('voucherCode') voucherCode?: string,
  ) {
    const result = await this.guestService.createOrderByGuest({
      data: createOrderDto,
      guestId: userId,
      voucherCode,
    })
    return result
  }

  /** Cấu hình VAT/phí của chi nhánh bàn khách đang ngồi — để FE hiện breakdown trước khi đặt món */
  @Get('tax-settings')
  async taxSettings(@ActiveUser('userId') guestId: number) {
    return await this.guestService.getBranchTaxSettings(guestId)
  }

  @Get('orders')
  @ZodSerializerDto(GuestOrdersListDTO)
  async getOrders(@Query() query: GuestOrdersQueryDTO, @ActiveUser('userId') guestId: number) {
    const result = await this.guestService.getGuestOrders({
      guestId,
      query,
    })
    return result
  }

  @Get('listGuests')
  @LogAccess({ route: 'GET /guest/listGuests' })
  @ZodSerializerDto(GuestListDTO)
  async getGuestList(@Query() query: GuestListQueryDTO, @ActiveUser() user: AccessTokenPayload) {
    const result = await this.guestService.getGuestList(query, user)
    return result
  }

  @Post('call-staff')
  async callStaff(@Body() body: CallStaffDTO, @ActiveUser('userId') guestId: number) {
    const result = await this.guestService.callStaff({ guestId, data: body })
    return result
  }
}
