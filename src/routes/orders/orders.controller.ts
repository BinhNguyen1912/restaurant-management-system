import { Body, Controller, Post, Res, HttpStatus, Query, Get, Param, Put } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import {
  GuestIdParamDTO,
  ListOrdersDTO,
  OrderDetailResDTO,
  OrderIdParamDTO,
  UpdateOrderDTO,
  UpdateOrderResDTO,
} from '@/routes/orders/orders.dtos'
import { ZodSerializerDto } from 'nestjs-zod'
import { OrderIdParamSchema } from '@/routes/orders/orders.model'
import { GuestCreateNewOrderDTO } from '@/routes/guest/guest.dtos'

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('lists')
  async list(@Body() query: ListOrdersDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.ordersService.list(query, user)
  }

  @Get(':id')
  @ZodSerializerDto(OrderDetailResDTO)
  async getById(@Param('id') id: string, @ActiveUser() user: AccessTokenPayload) {
    const orderId = Number(id)
    return await this.ordersService.getById(orderId, user)
  }

  @Put(':id')
  @ZodSerializerDto(UpdateOrderResDTO)
  async update(@Param() param: OrderIdParamDTO, @Body() body: UpdateOrderDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.ordersService.update({
      orderId: param.id,
      body,
      updatedById: user.userId,
      actorRole: user.roleName,
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

  @Get('pay-orders-by-guest/:guestId')
  async getOrderByTable(@Param() params: GuestIdParamDTO, @ActiveUser('userId') userId: number) {
    return await this.ordersService.payOrdersByGuest({
      guestId: +params.guestId,
      updatedById: userId,
    })
  }
}
