import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common'

import { CategoryRepo } from '@/routes/categories/category.repo'
import { isForeignKeyPrisma, isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { GuestRepo } from '@/routes/guest/guest.repo'
import {
  GuestOrdersQueryType,
  GuestOrdersListType,
  GuestListQueryType,
  GuestListType,
  CallStaffType,
} from '@/routes/guest/guest.model'
import { JsonWebTokenError } from '@nestjs/jwt'
import { SharedOrdersRepo } from '@/shared/shared-repository/shared-orders.repo'
import { SharedGuestRepo } from '@/shared/shared-repository/shared-guest.repo'
import { GuestLoginType } from '@/shared/models/shared-guest.model'
import { AppGateway } from '@/webSockets/app.gateway'
import { WS_EVENTS, ManagerRoom } from '@/shared/constants/others.constant'
import { CreateNewOrderType } from '@/shared/models/shared-order.model'

@Injectable()
export class GuestService {
  constructor(
    private readonly guestRepo: GuestRepo,
    private readonly sharedOrdersRepo: SharedOrdersRepo,
    private readonly sharedGuestRepo: SharedGuestRepo,
    private readonly appGateway: AppGateway,
  ) {}
  async login(data: GuestLoginType) {
    try {
      return await this.sharedGuestRepo.login(data)
    } catch (error) {
      throw error
    }
  }
  async logout({ guestId }: { guestId: number }) {
    await this.guestRepo.update(guestId, {
      refreshToken: null,
      refreshTokenExpiresAt: null,
    })
    return 'Đăng xuất thành công'
  }

  async GetNewAccessToken({ guestId, refreshToken }: { guestId: number; refreshToken: string }) {
    try {
      return await this.guestRepo.createTokenForGuest({
        guestId,
        refreshToken,
      })
    } catch (error) {
      if (error instanceof JsonWebTokenError) {
        throw new HttpException(error.message, HttpStatus.UNAUTHORIZED)
      }
    }
  }

  /**
   * Cấu hình VAT / phí phục vụ của chi nhánh mà khách đang ngồi.
   * Khách phải thấy trước khi đặt món: giá menu đã gồm VAT hay chưa, VAT bao nhiêu %.
   */
  async getBranchTaxSettings(guestId: number) {
    const guest = await this.guestRepo.findTaxSettingsByGuest(guestId)
    if (!guest?.tableNode) {
      throw new BadRequestException('Khách chưa gắn với bàn nào nên không xác định được chi nhánh')
    }
    const { branch } = guest.tableNode
    return {
      branchId: guest.tableNode.branchId,
      branchName: branch.name,
      taxRate: Number(branch.taxRate),
      serviceChargeRate: Number(branch.serviceChargeRate),
      pricesIncludeTax: branch.pricesIncludeTax,
    }
  }

  async createOrderByGuest({
    data,
    guestId,
    voucherCode,
  }: {
    data: CreateNewOrderType
    guestId: number
    voucherCode?: string
  }) {
    try {
      return await this.sharedOrdersRepo.CreateOrdersForGuest({ guestId, orderItems: data, voucherCode })
    } catch (error) {
      throw error
    }
  }

  async getGuestOrders({
    guestId,
    query,
  }: {
    guestId: number
    query: GuestOrdersQueryType
  }): Promise<GuestOrdersListType> {
    try {
      const result = await this.guestRepo.getGuestOrders(guestId, query)
      return result
    } catch (error) {
      throw error
    }
  }

  async getGuestList(query: GuestListQueryType): Promise<GuestListType> {
    try {
      return await this.guestRepo.list(query)
    } catch (error) {
      throw error
    }
  }

  async callStaff({ guestId, data }: { guestId: number; data: CallStaffType }): Promise<any> {
    try {
      const { tableNode } = data
      const guest = await this.guestRepo.findById(guestId)
      if (!guest) {
        throw new HttpException('Không tìm thấy thông tin khách hàng', HttpStatus.NOT_FOUND)
      }

      if (!guest.tableNodeId) {
        throw new HttpException('Khách hàng chưa được phân bàn', HttpStatus.BAD_REQUEST)
      }

      this.appGateway.server.to(ManagerRoom).emit(WS_EVENTS.CALL_STAFF, {
        message: 'Khách hàng yêu cầu hỗ trợ',
        guestId: guestId,
        guestName: guest.name || `Khách hàng #${guestId}`,
        tableNode: {
          id: tableNode.id,
          name: tableNode.name,
        },
      })

      return {
        message: 'Yêu cầu hỗ trợ đã được gửi đến nhân viên',
        guestId: guestId,
        tableNode: {
          id: tableNode.id,
          name: tableNode.name,
        },
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      throw new HttpException('Có lỗi xảy ra khi gửi yêu cầu hỗ trợ', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}
