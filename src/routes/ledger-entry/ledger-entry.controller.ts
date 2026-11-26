import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { LedgerEntryService } from '@/routes/ledger-entry/ledger-entry.service'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import {
  CashBookLineQueryDTO,
  CashBookLineResDTO,
  CashBookQueryDTO,
  CashBookResDTO,
  LedgerEntryListResDTO,
  LedgerEntryQueryDTO,
  LedgerIntegrityResDTO,
  LedgerReconciliationQueryDTO,
  LedgerReconciliationResDTO,
  SettleVnpayClearingDTO,
} from '@/routes/ledger-entry/ledger-entry.dtos'

@Controller('ledger')
export class LedgerEntryController {
  constructor(private readonly ledgerEntryService: LedgerEntryService) {}

  /** Nhật ký bút toán (audit): mỗi bút toán kèm dòng Nợ/Có */
  @Get('entries')
  @ZodSerializerDto(LedgerEntryListResDTO)
  async list(@Query() query: LedgerEntryQueryDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.ledgerEntryService.list(query, { userId: user.userId, roleName: user.roleName })
  }

  /** Sổ quỹ: Tiền mặt / Ngân hàng / Tổng quỹ theo kỳ (đầu kỳ, thu, chi, tồn) */
  @Get('cash-book')
  @ZodSerializerDto(CashBookResDTO)
  async cashBook(@Query() query: CashBookQueryDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.ledgerEntryService.cashBook(query, { userId: user.userId, roleName: user.roleName })
  }

  /** Các dòng (bút toán) của sổ quỹ — chứng minh cho 4 con số trên thẻ */
  @Get('cash-book/lines')
  @ZodSerializerDto(CashBookLineResDTO)
  async cashBookLines(
    @Query() query: CashBookLineQueryDTO,
    @Query('account') account: 'CASH' | 'BANK' | undefined,
    @ActiveUser() user: AccessTokenPayload,
  ) {
    return await this.ledgerEntryService.cashBookLines({ ...query, account }, {
      userId: user.userId,
      roleName: user.roleName,
    })
  }

  /** Đối soát Payment ↔ sổ cái theo phương thức (CASH, VNPAY) */
  @Get('reconciliation')
  @ZodSerializerDto(LedgerReconciliationResDTO)
  async reconcile(@Query() query: LedgerReconciliationQueryDTO) {
    return await this.ledgerEntryService.reconcile(query)
  }

  /** Ngân hàng báo có tiền VNPay: chuyển VNPAY_CLEARING -> BANK */
  @Post('vnpay-clearing/settle')
  async settle(@Body() body: SettleVnpayClearingDTO) {
    return await this.ledgerEntryService.settleVnpayClearing(body)
  }

  /** Sổ có cân không: tổng Nợ/Có + bất thường */
  @Get('integrity')
  @ZodSerializerDto(LedgerIntegrityResDTO)
  async integrity() {
    return await this.ledgerEntryService.integrity()
  }
}
