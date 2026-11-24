import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { LedgerEntryService } from '@/routes/ledger-entry/ledger-entry.service'
import {
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
  async list(@Query() query: LedgerEntryQueryDTO) {
    return await this.ledgerEntryService.list(query)
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
