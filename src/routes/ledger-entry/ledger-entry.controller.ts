import { Controller, Get, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { LedgerEntryService } from '@/routes/ledger-entry/ledger-entry.service'
import {
  LedgerEntryListResDTO,
  LedgerEntryQueryDTO,
  LedgerIntegrityResDTO,
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

  /** Sổ có cân không: tổng Nợ/Có + bất thường */
  @Get('integrity')
  @ZodSerializerDto(LedgerIntegrityResDTO)
  async integrity() {
    return await this.ledgerEntryService.integrity()
  }
}
