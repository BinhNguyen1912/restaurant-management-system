import { Controller, Post, Get, Body, Req, Res, Param, Query, ForbiddenException } from '@nestjs/common'
import { Response, Request } from 'express'
import { IsPublic } from '@/shared/decorators/auth.decorator'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { CreatePaymentUrlDTO } from '@/routes/payment/payment.dto'
import { VnPayService } from '@/shared/service/vnpay.service'

@Controller('payment/vnpay')
export class VnPayController {
  constructor(private readonly vnPayService: VnPayService) {}

  @Post('create-url')
  async createPaymentUrl(
    @Body() body: CreatePaymentUrlDTO,
    @Req() req: Request,
    // Khong dung body.guestId mot cach mu quang: token phai la cua chinh guest do,
    // neu khong bat ky ai dang nhap cung tao duoc URL thanh toan cho don nguoi khac.
    @ActiveUser('userId') userId: number,
  ) {
    if (Number(body.guestId) !== Number(userId)) {
      throw new ForbiddenException('Error.PaymentNotOwned')
    }
    const paymentUrl = await this.vnPayService.createPaymentUrlForGuest({
      guestId: userId,
      req,
    })
    return { paymentUrl }
  }

  @IsPublic()
  @Get('return')
  async handleReturn(@Query() query: any, @Res() res: Response) {
    try {
      console.log('VNPay Return Data:', query)
      return await this.vnPayService.handleVnPayReturn(query, res)
    } catch (error) {
      console.error('Error handling VNPay return:', error)
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/payment-error?error=server_error`)
    }
  }

  @IsPublic()
  @Get('ipn')
  async handleIpn(@Query() query: any, @Res() res: Response) {
    await this.vnPayService.handleVnPayIpn(query, res)
  }

  @Post('query')
  async queryTransaction(@Body() body: { orderId: string; transDate: string }) {
    return await this.vnPayService.queryTransaction(body.orderId, body.transDate)
  }
}
