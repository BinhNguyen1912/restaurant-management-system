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
      throw new UnprocessableEntityException('Error.TableBrokenOrUnavailable')
    }
    if (table.status == TableStatus.RESERVED) {
      throw new UnprocessableEntityException('Error.TableReserved')
    }
    /**
     * Khách chỉ quét QR được khi NHÂN VIÊN đã mở bàn.
     *
     * Trước đây chính khách login tự set OCCUPIED, nên ai có ảnh chụp QR (gửi qua chat, chụp
     * lúc đi qua) cũng đặt món từ nhà — và chiếm luôn bàn của khách thật. Giờ quyền mở bàn
     * thuộc về nhân viên (`POST /table-node/:id/open`).
     */
    if (!table.openedAt || table.status !== TableStatus.OCCUPIED) {
      throw new UnprocessableEntityException('Error.TableNotOpened')
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
      throw new UnprocessableEntityException('Error.TableBrokenOrUnavailable')
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
