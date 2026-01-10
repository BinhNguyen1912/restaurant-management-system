import { roleName } from '@/shared/constants/role.constant'
import { RoleType } from '@/shared/models/shared-role.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

export type whereUniqueRoleType = { id: number; [key: string]: any }
@Injectable()
export class SharedRoleRepo {
  private ClientRole: { roleId: number; roleName: string } | null = null

  private AdminRoleId: number | null = null
  private GuestRoleId: { roleId: number; roleName: string } | null = null

  constructor(private readonly prismaService: PrismaService) {}
  private async getCachedRole(roleName: string) {
    /* Vì khi mình gỡ bỏ UNIQUE constraint của name, thì giá trị name trong bảng Role có thể bị trùng, nên:

  -> Không thể dùng Prisma findUnique({ where: { name: 'Admin' } }) nữa (vì name không còn là unique field)

  -> Prisma chỉ cho phép dùng findUnique() với các cột được đánh dấu @unique trong schema.prisma
  
  -> Chính vì thế mình dùng lệnh $queryRaw , để viết lệnh sql gọi trả về    */
    const role: RoleType = await this.prismaService.$queryRaw<
      RoleType[]
    >`SELECT * FROM "Role" where name=${roleName} AND "deletedAt" IS NULL LIMIT 1;`.then((res: RoleType[]) => {
      if (res.length == 0) {
        throw new Error('Role name not found')
      }
      return res[0]
    })
    return role
  }

  async getRoleClient() {
    //Cach nay la goi 1 lan nhung dung suot thoi gian nguoi dung su dung
    if (this.ClientRole) {
      return this.ClientRole
    }
    const role = await this.getCachedRole(roleName.USER)
    this.ClientRole = {
      roleId: role.id,
      roleName: role.name,
    }
    return { roleId: role.id, roleName: role.name }
  }
  //   async getRoleAdminId() {
  //     if (this.AdminRoleId) return this.AdminRoleId
  //     const role = await this.getCachedRole(roleName.ADMIN)
  //     this.AdminRoleId = role.id
  //     return this.AdminRoleId
  //   }

  async findRoleById(where: whereUniqueRoleType) {
    return await this.prismaService.role.findUnique({ where })
  }

  async getRoleAdminId() {
    if (this.AdminRoleId) return this.AdminRoleId
    const role = await this.getCachedRole(roleName.ADMIN)
    this.AdminRoleId = role.id
    return this.AdminRoleId
  }
  async getRoleGuestId() {
    if (this.GuestRoleId) {
      return this.GuestRoleId
    }
    const role = await this.getCachedRole(roleName.GUEST)
    this.GuestRoleId = {
      roleId: role.id,
      roleName: role.name,
    }
    return { roleId: role.id, roleName: role.name }
  }
}
