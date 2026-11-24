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
      throw new UnprocessableEntityException('Bàn hỏng hoặc bàn không sử dụng được')
    }
    if (table.status == TableStatus.RESERVED) {
      throw new UnprocessableEntityException('Bàn đang được đặt trước. Vui lòng liên hệ với Nhà Hàng')
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
  async createTokenForGuest({ guestId, refreshToken: RT }: { guestId: number; refreshToken: string }): Promise<{
    accessToken: string
    refreshToken: string
  }> {
    try {
      await this.tokenService.VerifyRefreshToken(RT)
    } catch (error) {
      throw error
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
      this.tokenService.createRefreshToken({ roleId: roleId.id, roleName: roleId.name, userId: guestId }),
    ])
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

  async list(query: GuestListQueryType): Promise<GuestListType> {
    const { limit, page } = query
    const take = limit ?? 10
    const skip = (page - 1) * take
    const where: Prisma.GuestWhereInput = {
      deletedAt: null,
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
}
