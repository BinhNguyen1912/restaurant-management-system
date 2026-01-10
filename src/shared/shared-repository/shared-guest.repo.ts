import { roleName } from '@/shared/constants/role.constant'
import { TableStatus } from '@/shared/constants/table.constant'
import { CreateGuestType, GuestLoginResType, GuestLoginType } from '@/shared/models/shared-guest.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { TokenService } from '@/shared/service/token.service'
import { SharedRoleRepo } from '@/shared/shared-repository/shared-role.repo'
import { Injectable, UnprocessableEntityException } from '@nestjs/common'

@Injectable()
export class SharedGuestRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sharedRoleRepo: SharedRoleRepo,
    private readonly tokenService: TokenService,
  ) {}
  async login(data: GuestLoginType): Promise<GuestLoginResType> {
    const { tableNodeId, token, name } = data
    const [table, guestRole] = await Promise.all([
      this.prismaService.tableNode.findUnique({ where: { token, id: tableNodeId } }),
      this.sharedRoleRepo.getRoleGuestId(),
    ])
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
      this.prismaService.tableNode.update({
        where: { id: tableNodeId },
        data: { status: TableStatus.OCCUPIED },
      }),
    ])
    const decodeRefreshToken = await this.tokenService.VerifyGuestRefreshToken(refreshToken)
    const refreshTokenExpiresAt = new Date(decodeRefreshToken.exp * 1000)
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
      guest: {
        ...guest,
        role: roleName.GUEST,
        tableName: table.name,
      },
      accessToken,
      refreshToken,
    } as any
  }
  async createGuest({ createdById, data }: { data: CreateGuestType; createdById: number }) {
    const { name, tableNodeId } = data
    const table = await this.prismaService.tableNode.findUnique({ where: { id: tableNodeId } })
    if (!table) {
      throw new UnprocessableEntityException('Error.TableNodeNotFound')
    }
    if (table.status == TableStatus.HIDE) {
      throw new UnprocessableEntityException('Error.TableIsHidden')
    }
    if (table.status == TableStatus.OUT_OF_SERVICE) {
      throw new UnprocessableEntityException('Bàn hỏng hoặc bàn không sử dụng được')
    }

    const guest = await this.prismaService.guest.create({
      data: {
        name,
        tableNodeId,
        createdById,
      },
    })
    return guest
  }
}
