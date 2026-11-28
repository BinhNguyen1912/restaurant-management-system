import { Body, Controller, Post, Res, HttpStatus, HttpCode, Query, Get, Param, Put } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { ActiveRole } from '@/shared/decorators/active-role.decorator'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import {
  GuestIdParamDTO,
  ListOrdersDTO,
  OrderDetailResDTO,
  OrderIdParamDTO,
  UpdateOrderDTO,
  UpdateOrderResDTO,
  PayGuestOrdersDTO,
} from '@/routes/orders/orders.dtos'
import { ZodSerializerDto } from 'nestjs-zod'
import { OrderIdParamSchema } from '@/routes/orders/orders.model'
import { GuestCreateNewOrderDTO } from '@/routes/guest/guest.dtos'
import { LogAccess } from '@/shared/decorators/access-log.decorator'

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('lists')
  @LogAccess({ route: 'POST /orders/lists' })
  async list(@Body() query: ListOrdersDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.ordersService.list(query, user)
  }

  @Get(':id')
  @LogAccess({ route: 'GET /orders/:id' })
  @ZodSerializerDto(OrderDetailResDTO)
  async getById(@Param('id') id: string, @ActiveUser() user: AccessTokenPayload) {
    const orderId = Number(id)
    return await this.ordersService.getById(orderId, user)
  }

  @Put(':id')
  @ZodSerializerDto(UpdateOrderResDTO)
  async update(
    @Param() param: OrderIdParamDTO,
    @Body() body: UpdateOrderDTO,
    @ActiveUser('userId') userId: number,
    @ActiveRole('name') roleName: string,
  ) {
    return await this.ordersService.update({
      orderId: param.id,
      body,
      updatedById: userId,
      actorRole: roleName,
    })
  }

  @Post('create-order-for-guest/:guestId')
  async createOrderForGuest(
    @Body() body: GuestCreateNewOrderDTO,
    @Param('guestId') guestId: string,
    @ActiveUser('userId') userId: number,
    @Query('voucherCode') voucherCode?: string,
  ) {
    return await this.ordersService.createOrderForGuest({
      guestId: +guestId,
      orderItems: body,
      createdById: userId,
      voucherCode,
    })
  }

  /**
   * Thu tiền các đơn đang mở của khách. Là **POST** (trước đây GET — endpoint ghi tiền mà khai báo
   * GET thì bị prefetch/retry gọi hộ, và không có body để ghi phương thức thu).
   *
   * `@HttpCode(200)`: đây là thao tác thu tiền trên đơn đã có, không tạo tài nguyên mới. Để mặc định
   * 201 thì FE và e2e (và bất kỳ client nào kiểm mã 200) đều hiểu sai kết quả.
   */
  @Post('pay-guest/:guestId')
  @HttpCode(200)
  async payGuestOrders(
    @Param() params: GuestIdParamDTO,
    @Body() body: PayGuestOrdersDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return await this.ordersService.payOrdersByGuest({
      guestId: +params.guestId,
      updatedById: userId,
      method: body.method,
      note: body.note,
    })
  }
}
