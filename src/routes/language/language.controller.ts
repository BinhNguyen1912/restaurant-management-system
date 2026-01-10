import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common'
import { LanguageService } from './language.service'

import { ZodSerializerDto } from 'nestjs-zod'
import {
  GetAllLanguageResDTO,
  getLanguageIncludeCreateByDTO,
  LanguageBodyDTO,
  LanguageResDTO,
  UpdateLanguageBodyDTO,
} from '@/routes/language/language.dto'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { MessageResDto } from '@/shared/dtos/respone.dto'

@Controller('languages')
export class LanguageController {
  constructor(private readonly languageService: LanguageService) {}

  @Post()
  @ZodSerializerDto(LanguageResDTO)
  create(@Body() languageBodyDTO: LanguageBodyDTO, @ActiveUser() user: AccessTokenPayload) {
    return this.languageService.create({ ...languageBodyDTO, createdById: user.userId })
  }

  @Get(':languageId')
  @ZodSerializerDto(getLanguageIncludeCreateByDTO)
  async findOne(@Param('languageId') languageId: string) {
    return await this.languageService.findOne(languageId)
  }

  @Patch(':languageId')
  @ZodSerializerDto(LanguageResDTO)
  async update(
    @Param('languageId') languageId: string,
    @Body() languageBodyType: UpdateLanguageBodyDTO,
    @ActiveUser('userId') userId: number,
  ) {
    return await this.languageService.updateLanguage({ id: languageId, data: languageBodyType, updatedById: userId })
  }

  @Get('')
  @ZodSerializerDto(GetAllLanguageResDTO)
  async getAll() {
    return await this.languageService.getAllLanguage()
  }
  @Delete(':languageId')
  @ZodSerializerDto(MessageResDto)
  async delete(@Param('languageId') languageId: string) {
    return await this.languageService.delete(languageId)
  }
}
