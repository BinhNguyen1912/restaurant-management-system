import { Controller, Post, Get, Body, Req, Res, Param, Query } from '@nestjs/common'
import { Response, Request } from 'express'
import { IsPublic } from '@/shared/decorators/auth.decorator'
import { CreatePaymentUrlDTO } from '@/routes/payment/payment.dto'
import { VnPayService } from '@/shared/service/vnpay.service'

@Controller('payment/vnpay')
export class VnPayController {
  constructor(private readonly vnPayService: VnPayService) {}

  @Post('create-url')
  async createPaymentUrl(@Body() body: CreatePaymentUrlDTO, @Req() req: Request) {
    const paymentUrl = await this.vnPayService.createPaymentUrlForGuest({
      guestId: body.guestId,
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
