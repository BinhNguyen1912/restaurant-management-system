import { toMoneyNumbers } from '@/shared/service/money-serializer'
import { GuestLoginResDTO } from '@/routes/guest/guest.dtos'
import { NotFoundRefreshToken } from '@/routes/guest/guest.error'
import {
  GuestCreateOrderType,
  GuestOrdersQueryType,
  GuestOrdersListType,
  GuestListQueryType,
  GuestListType,
} from '@/routes/guest/guest.model'
import { roleName } from '@/shared/constants/role.constant'
import { TableStatus } from '@/shared/constants/table.constant'
import { GuestLoginResType, GuestLoginType, GuestType } from '@/shared/models/shared-guest.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { TokenService } from '@/shared/service/token.service'
import { SharedOrdersRepo } from '@/shared/shared-repository/shared-orders.repo'
import { SharedRoleRepo } from '@/shared/shared-repository/shared-role.repo'
import { HttpException, HttpStatus, Injectable, UnprocessableEntityException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class GuestRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly tokenService: TokenService,
    private readonly sharedRoleRepo: SharedRoleRepo,
    private readonly sharedOrdersRepo: SharedOrdersRepo,
  ) {}
  async login(data: GuestLoginType): Promise<GuestLoginResType> {
    const { tableNodeId, token, name } = data
    const [table, guestRole] = await Promise.all([
      this.prismaService.tableNode.findUnique({ where: { token, id: tableNodeId } }),
      this.sharedRoleRepo.getRoleGuestId(),
    ])
    console.log('table', table)

    if (!table) {
      throw new UnprocessableEntityException('Error.TableNodeNotFound')
    }
    if (table.status == TableStatus.HIDE) {
      throw new UnprocessableEntityException('Error.TableNodeNotFound')
    }
    if (table.status == TableStatus.OUT_OF_SERVICE) {
      throw new UnprocessableEntityException('Error.TableBrokenOrUnavailable')
    }
    if (table.status == TableStatus.RESERVED) {
      throw new UnprocessableEntityException('Error.TableReserved')
    }

    let guest = await this.prismaService.guest.create({
      data: {
        name,
        tableNodeId,
      },
    })

    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.createGuestAcessToken({
        roleId: guestRole.roleId,
        roleName: guestRole.roleName,
        userId: guest.id,
        tableNodeId: table.id,
      }),
      this.tokenService.createGuestRefreshToken({
        roleId: guestRole.roleId,
        roleName: guestRole.roleName,
        userId: guest.id,
        tableNodeId: table.id,
      }),
    ])
    const decodeRefreshToken = await this.tokenService.VerifyGuestRefreshToken(refreshToken)
    const refreshTokenExpiresAt = new Date(decodeRefreshToken.exp * 1000).toISOString()
    guest = await this.prismaService.guest.update({
      where: {
        id: guest.id,
      },
      data: {
        refreshTokenExpiresAt,
        refreshToken,
      },
    })

    return {
      accessToken,
      refreshToken,
      guest: {
        createdAt: guest.createdAt,
        createdById: guest.createdById,
        deletedAt: guest.deletedAt,
        deletedById: guest.deletedById,
        id: guest.id,
        name: guest.name,
        role: roleName.GUEST,
        tableName: table.name,
        tableNodeId: guest.tableNodeId,
        updatedAt: guest.updatedAt,
        updatedById: guest.updatedById,
      },
    }
  }

  update(id: number, data: Partial<GuestType>) {
    return this.prismaService.guest.update({
      where: {
        id,
      },
      data,
    })
  }
  /**
   * Cấp lại access token cho khách bằng refresh token.
   *
   * Refresh token phải được đối chiếu với DB (`Guest.refreshToken` + hạn) — trước đây chỉ verify
   * chữ ký, nên một RT bị lộ dùng lại được tới khi hết hạn, kể cả sau khi khách đã logout.
   * Cấp xong thì ROTATE: RT cũ bị thay ngay trong DB.
   */
  async createTokenForGuest({ refreshToken: RT }: { refreshToken: string }): Promise<{
    accessToken: string
    refreshToken: string
  }> {
    const payload = await this.tokenService.VerifyGuestRefreshToken(RT)
    const guestId = payload.userId

    const guest = await this.prismaService.guest.findFirst({
      where: { id: guestId, deletedAt: null },
      select: { refreshToken: true, refreshTokenExpiresAt: true },
    })
    if (!guest?.refreshToken || guest.refreshToken !== RT) {
      throw new HttpException('Error.RefreshTokenNotFoundOrExpired', HttpStatus.UNAUTHORIZED)
    }
    if (guest.refreshTokenExpiresAt && guest.refreshTokenExpiresAt.getTime() <= Date.now()) {
      throw new HttpException('Error.RefreshTokenNotFoundOrExpired', HttpStatus.UNAUTHORIZED)
    }

    const roleId = await this.prismaService.role.findFirst({
      where: {
        name: roleName.GUEST,
      },
    })
    if (!roleId) {
      throw new HttpException('Role Not Found', HttpStatus.NOT_FOUND)
    }
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.createAcessToken({ roleId: roleId.id, roleName: roleId.name, userId: guestId }),
      this.tokenService.createGuestRefreshToken({
        roleId: roleId.id,
        roleName: roleId.name,
        userId: guestId,
        tableNodeId: payload.tableNodeId,
      }),
    ])

    const decodeRefreshToken = await this.tokenService.VerifyGuestRefreshToken(refreshToken)
    await this.prismaService.guest.update({
      where: { id: guestId },
      data: {
        refreshToken,
        refreshTokenExpiresAt: new Date(decodeRefreshToken.exp * 1000),
      },
    })

    return {
      accessToken,
      refreshToken,
    }
  }

  async getGuestOrders(guestId: number, query: GuestOrdersQueryType): Promise<GuestOrdersListType> {
    const { limit, page, status } = query
    const take = limit
    const skip = (page - 1) * limit

    const where: any = {
      guestId,
      deletedAt: null,
    }

    if (status) {
      where.status = status
    }

    const [data, totalItems] = await Promise.all([
      this.prismaService.order.findMany({
        where,
        include: {
          payment: {
            select: {
              method: true,
              amount: true,
              status: true,
            },
          },
          items: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
      }),
      this.prismaService.order.count({
        where,
      }),
    ])

    const transformedData = data.map((order) => ({
      ...order,
      payment: {
        ...order.payment,
        // API /guest/orders giu hop dong cu: so tien la string (DTO GuestOrdersList yeu cau string)
        amount: order.payment.amount.toString(),
      },
      items: order.items.map((item) => ({
        ...item,
      })),
    }))

    return {
      data: toMoneyNumbers(transformedData),
      limit,
      page,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    }
  }

  async list(query: GuestListQueryType, branchId?: number): Promise<GuestListType> {
    const { limit, page } = query
    const take = limit ?? 10
    const skip = (page - 1) * take
    // `Guest` không có cột `branchId` — chi nhánh suy ra từ bàn mà khách đang ngồi.
    // Thiếu điều kiện này thì STAFF chi nhánh A đọc được tên khách của mọi chi nhánh.
    const where: Prisma.GuestWhereInput = {
      deletedAt: null,
      ...(branchId ? { tableNode: { branchId } } : {}),
    }

    const [totalItems, data] = await Promise.all([
      this.prismaService.guest.count({
        where,
      }),
      this.prismaService.guest.findMany({
        where,
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          tableNode: true,
        },
        omit: {
          refreshToken: true,
          refreshTokenExpiresAt: true,
        },
      }),
    ])

    return {
      data,
      limit,
      page,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    }
  }

  async findById(guestId: number) {
    return await this.prismaService.guest.findUnique({
      where: {
        id: guestId,
        deletedAt: null,
      },
      include: {
        tableNode: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })
  }

  async getTableNodeById(tableNodeId: number) {
    return await this.prismaService.tableNode.findUnique({
      where: {
        id: tableNodeId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    })
  }

  /** Cấu hình VAT/phí của chi nhánh mà khách đang ngồi (dùng cho FE hiện breakdown trước khi đặt món) */
  findTaxSettingsByGuest(guestId: number) {
    return this.prismaService.guest.findUnique({
      where: { id: guestId },
      select: {
        tableNode: {
          select: {
            branchId: true,
            branch: { select: { name: true, taxRate: true, serviceChargeRate: true, pricesIncludeTax: true } },
          },
        },
      },
    })
  }
}
