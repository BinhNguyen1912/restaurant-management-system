import { ManageProductService } from '@/routes/products/manage-product.service'
import {
  CreateProductBodyDTO,
  GetManageQueryDTO,
  GetProductDetailResDTO,
  GetProductParamDTO,
  GetProductsResDTO,
  UpdateProductBodyDTO,
} from '@/routes/products/product.dtos'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { LocaleParam } from '@/shared/decorators/locale.decorator'
import { Locale } from '@/shared/i18n/locale'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('manage-product/products')
export class ManageProductController {
  constructor(private readonly manageProductService: ManageProductService) {}

  @Post()
  @ZodSerializerDto(GetProductDetailResDTO)
  async create(
    @Body() body: CreateProductBodyDTO,
    @ActiveUser('userId') userId: number,
    @LocaleParam() locale: Locale,
  ) {
    return await this.manageProductService.create({
      createdById: userId,
      data: body,
      locale,
    })
  }

  @Get(':productId')
  @ZodSerializerDto(GetProductDetailResDTO)
  async findById(
    @Param() param: GetProductParamDTO,
    @ActiveUser() user: AccessTokenPayload,
    @LocaleParam() locale: Locale,
  ) {
    return this.manageProductService.findById({
      productId: param.productId,
      userIdRequest: user.userId,
      roleNameRequest: user.roleName,
      locale,
    })
  }

  @Put(':productId')
  @ZodSerializerDto(GetProductDetailResDTO)
  async update(
    @Param() param: GetProductParamDTO,
    @Body() body: UpdateProductBodyDTO,
    @ActiveUser() user: AccessTokenPayload,
    @LocaleParam() locale: Locale,
  ) {
    return await this.manageProductService.update({
      data: body,
      productId: param.productId,
      roleNameRequest: user.roleName,
      locale,
      updatedById: user.userId,
    })
  }

  @Delete(':productId')
  @ZodSerializerDto(GetProductDetailResDTO)
  async delete(@Param() param: GetProductParamDTO, @ActiveUser() user: AccessTokenPayload) {
    return await this.manageProductService.delete({
      productId: param.productId,
      deletedById: user.userId,
      roleNameRequest: user.roleName,
    })
  }

  @Get()
  @ZodSerializerDto(GetProductsResDTO)
  async getList(
    @Query() query: GetManageQueryDTO,
    @ActiveUser() user: AccessTokenPayload,
    @LocaleParam() locale: Locale,
  ) {
    const list = await this.manageProductService.list({
      query,
      userIdRequest: user.userId,
      roleNameRequest: user.roleName,
      locale,
    })
    return list
  }
}
