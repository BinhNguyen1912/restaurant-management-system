import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { CashShiftService } from '@/routes/cash-shift/cash-shift.service'
import {
  CashMovementResDTO,
  CashShiftDetailResDTO,
  CashShiftListQueryDTO,
  CashShiftListResDTO,
  CashShiftParamDTO,
  CashShiftResDTO,
  CloseCashShiftDTO,
  CreateCashMovementDTO,
  OpenCashShiftDTO,
} from '@/routes/cash-shift/cash-shift.dtos'
import { CashShiftSchema } from '@/routes/cash-shift/cash-shift.model'

@Controller('cash-shifts')
export class CashShiftController {
  constructor(private readonly cashShiftService: CashShiftService) {}

  @Get()
  @ZodSerializerDto(CashShiftListResDTO)
  async list(@Query() query: CashShiftListQueryDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.cashShiftService.list(query, user)
  }

  /** Ca dang mo cua chi nhanh (null neu chua mo) — khong dung ZodSerializerDto vi schema nullable */
  @Get('current')
  async current(@ActiveUser() user: AccessTokenPayload) {
    return await this.cashShiftService.current(user)
  }

  @Get(':id')
  @ZodSerializerDto(CashShiftDetailResDTO)
  async detail(@Param() params: CashShiftParamDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.cashShiftService.detail(params.id, user)
  }

  @Post()
  @ZodSerializerDto(CashShiftResDTO)
  async open(@Body() body: OpenCashShiftDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.cashShiftService.open(user, body)
  }

  @Post(':id/movements')
  @ZodSerializerDto(CashMovementResDTO)
  async addMovement(
    @Param() params: CashShiftParamDTO,
    @Body() body: CreateCashMovementDTO,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return await this.cashShiftService.addMovement(params.id, user, body)
  }

  @Post(':id/close')
  @ZodSerializerDto(CashShiftSchema)
  async close(@Param() params: CashShiftParamDTO, @Body() body: CloseCashShiftDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.cashShiftService.close(params.id, user, body)
  }
}
