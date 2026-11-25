import { RoleNotFoundException } from '@/routes/role/role.error'
import {
  CannotUpdateOrDeleteOwnRoleException,
  ForeignKeyViolationException,
  RoleNotAllowedException,
  UserNotFoundException,
} from '@/routes/users/users.error'
import { GetUsersQueryType, UpdateUserBodyType, UserBodyType } from '@/routes/users/users.model'
import { UsersRepository } from '@/routes/users/users.repo'
import { roleName } from '@/shared/constants/role.constant'
import { EmailAlreadyExistsException } from '@/shared/error'
import { isForeignKeyPrisma, isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { CreateGuestType } from '@/shared/models/shared-guest.model'
import { HashingService } from '@/shared/service/hashing.service'
import { SharedGuestRepo } from '@/shared/shared-repository/shared-guest.repo'
import { SharedRoleRepo } from '@/shared/shared-repository/shared-role.repo'
import { SharedUserRepo } from '@/shared/shared-repository/shared-user.repo'
import { Injectable, UnauthorizedException } from '@nestjs/common'

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UsersRepository,
    private readonly sharedUserRepo: SharedUserRepo,
    private readonly sharedRoleRepo: SharedRoleRepo,
    private readonly hashingservice: HashingService,
    private readonly sharedGuestRepo: SharedGuestRepo,
  ) {}

  async verifyRole({ roleNameAgent, roleIdTaget }: { roleNameAgent: string; roleIdTaget: number }) {
    if (roleNameAgent == roleName.ADMIN) return true
    else {
      const adminRoleId = await this.sharedRoleRepo.getRoleAdminId()
      if (adminRoleId == roleIdTaget) {
        throw RoleNotAllowedException
      }
      return true
    }
  }

  verifyYourSelf({ userAgentId, userTagetId }: { userAgentId: number; userTagetId: number }) {
    if (userAgentId == userTagetId) throw CannotUpdateOrDeleteOwnRoleException
  }
  async create({ roleName, body, createdById }: { roleName: string; createdById: number; body: UserBodyType }) {
    try {
      const { roleId, email, password } = body
      const user = await this.sharedUserRepo.findUniqueUser({ email })

      if (user && user != null) {
        throw EmailAlreadyExistsException
      }
      const role = await this.sharedRoleRepo.findRoleById({
        id: roleId,
        deletedAt: null,
      })
      if (!role) throw RoleNotFoundException
      await this.verifyRole({ roleNameAgent: roleName, roleIdTaget: roleId })
      const Hashpassword = await this.hashingservice.hashPassword(password)
      return await this.userRepository.createUser({ ...body, password: Hashpassword, createdById })
    } catch (error) {
      if (isNotFoundPrisma(error)) throw RoleNotFoundException
      if (isUniqueConstraintPrisma(error)) {
        console.log('error', error)
        throw new UnauthorizedException({
          message: `${(error.meta as any).target[0] as string} đã tồn tại`,
          code: error.code,
        })
      }
      if (isForeignKeyPrisma(error)) throw ForeignKeyViolationException
      throw error
    }
  }

  async getUser(id: number) {
    try {
      const user = await this.sharedUserRepo.findUserIncludeRolePermissions({ id })
      if (!user) throw UserNotFoundException
      return user
    } catch (error) {
      if (isNotFoundPrisma(error)) throw UserNotFoundException
      throw error
    }
  }

  async update({
    data,
    id,
    updatedById,
    updateByRoleName,
  }: {
    id: number
    data: UpdateUserBodyType
    updatedById: number
    updateByRoleName: string
  }) {
    try {
      if (data.changePassword) {
        // `branchId` phải nằm trong đây: trước đây service chỉ bóc đúng danh sách trường cố định
        // nên đổi chi nhánh (hoặc bỏ gán = null) bị nuốt im lặng — API trả 200 mà DB không đổi.
        const { email, name, roleId, avatar, password, phoneNumber, status, branchId } = data
        const currentUser = await this.sharedUserRepo.findUniqueUser({ id })
        //Lấy thông tin user được update ra và kiểm tra tồm tại
        if (!currentUser) throw UserNotFoundException
        const hashPassword = await this.hashingservice.hashPassword(data.newPassword as string)
        //Kiểm tra xem người dùng đó có tự cập nhật role của chính mình không , nếu có thì không cho phép
        this.verifyYourSelf({ userAgentId: id, userTagetId: updatedById })

        // Kiểm tra quyền hiện tại so với quyền mục tiêu
        await this.verifyRole({ roleNameAgent: updateByRoleName, roleIdTaget: currentUser.roleId })

        //Kiểm tra người update có quyền được update người khác không
        if (data.roleId && data.roleId != currentUser.roleId) {
          await this.verifyRole({ roleNameAgent: updateByRoleName, roleIdTaget: data.roleId })
        }
        return await this.sharedUserRepo.update(id, {
          password: hashPassword,
          name,
          roleId,
          avatar,
          phoneNumber,
          status,
          updatedById,
          email,
          // undefined = không gửi thì Prisma giữ nguyên; null = bỏ gán chi nhánh
          branchId,
        })
      } else {
        //Lấy thông tin user được update ra và kiểm tra tồm tại
        const currentUser = await this.sharedUserRepo.findUniqueUser({ id })
        if (!currentUser) throw UserNotFoundException
        const { email, name, roleId, avatar, phoneNumber, status, branchId } = data
        //Kiểm tra xem người dùng đó có tự cập nhật role của chính mình không , nếu có thì không cho phép
        this.verifyYourSelf({ userAgentId: id, userTagetId: updatedById })

        // Kiểm tra quyền hiện tại so với quyền mục tiêu
        await this.verifyRole({ roleNameAgent: updateByRoleName, roleIdTaget: currentUser.roleId })

        //Kiểm tra người update có quyền được update người khác không
        if (data.roleId && data.roleId != currentUser.roleId) {
          await this.verifyRole({ roleNameAgent: updateByRoleName, roleIdTaget: data.roleId })
        }
        return await this.sharedUserRepo.update(id, {
          password: currentUser.password,
          name,
          roleId,
          avatar,
          phoneNumber,
          status,
          updatedById,
          email,
          // undefined = không gửi thì Prisma giữ nguyên; null = bỏ gán chi nhánh
          branchId,
        })
      }
    } catch (error) {
      if (isNotFoundPrisma(error)) throw UserNotFoundException
      if (isUniqueConstraintPrisma(error)) throw EmailAlreadyExistsException
      if (isForeignKeyPrisma(error)) {
        throw RoleNotFoundException
      }
      throw error
    }
  }
  async getList(pagination: GetUsersQueryType) {
    try {
      return await this.userRepository.getListUsers(pagination)
    } catch (error) {
      throw error
    }
  }
  async delete({ id, deletedById, roleNameAgent }: { id: number; roleNameAgent: string; deletedById?: number }) {
    const currentUser = await this.sharedUserRepo.findUniqueUser({ id })
    if (!currentUser) throw UserNotFoundException

    //Kiểm tra nó có đủ quyền xóa user không
    await this.verifyRole({ roleNameAgent, roleIdTaget: currentUser.roleId })

    //không thể xóa chính mình
    await this.verifyYourSelf({
      userAgentId: id,
      userTagetId: deletedById as number,
    })
    return await this.userRepository.deleteUser({ id, deletedById, isHard: true })
    // return {
    //   message: 'Delete successfully',
    // }
  }

  async createGuest({ createdById, data }: { data: CreateGuestType; createdById: number }) {
    try {
      return await this.sharedGuestRepo.createGuest({ createdById, data })
    } catch (error) {
      throw error
    }
  }
}
