import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { LedgerAccountService } from '@/routes/ledger-account/ledger-account.service'
import {
  CreateLedgerAccountDTO,
  GetLedgerAccountsResDTO,
  LedgerAccountParamDTO,
  LedgerAccountQueryDTO,
  UpdateLedgerAccountDTO,
} from '@/routes/ledger-account/ledger-account.dtos'

@Controller('ledger-accounts')
export class LedgerAccountController {
  constructor(private readonly ledgerAccountService: LedgerAccountService) {}

  @Get()
  @ZodSerializerDto(GetLedgerAccountsResDTO)
  async list(@Query() query: LedgerAccountQueryDTO) {
    return await this.ledgerAccountService.list(query)
  }

  @Post()
  async create(@Body() body: CreateLedgerAccountDTO) {
    return await this.ledgerAccountService.create(body)
  }

  @Put(':id')
  async update(@Param() params: LedgerAccountParamDTO, @Body() body: UpdateLedgerAccountDTO) {
    return await this.ledgerAccountService.update(params.id, body)
  }

  @Delete(':id')
  async delete(@Param() params: LedgerAccountParamDTO) {
    return await this.ledgerAccountService.delete(params.id)
  }
}
