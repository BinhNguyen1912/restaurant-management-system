import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { VoucherService } from '@/routes/voucher/voucher.service'
import {
  VoucherBodyDTO,
  VoucherListResDTO,
  VoucherQueryDTO,
  VoucherStatusBodyDTO,
} from '@/routes/voucher/voucher.dtos'

/** Quản lý voucher — ADMIN (khách chỉ nhập mã ở giỏ hàng, không được quản lý). */
@Controller('vouchers')
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  @Get()
  @ZodSerializerDto(VoucherListResDTO)
  async list(@Query() query: VoucherQueryDTO) {
    return await this.voucherService.list(query)
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return await this.voucherService.detail(id)
  }

  @Post()
  async create(@Body() body: VoucherBodyDTO, @ActiveUser('userId') userId: number) {
    return await this.voucherService.create(body, userId)
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: VoucherBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return await this.voucherService.update(id, body, userId)
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: VoucherStatusBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return await this.voucherService.updateStatus(id, body.status, userId)
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @ActiveUser('userId') userId: number) {
    return await this.voucherService.remove(id, userId)
  }
}
