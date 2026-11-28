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
import { SharedRefreshTokenRepo } from '@/shared/shared-repository/shared-refreshToken'
import { SharedRoleRepo } from '@/shared/shared-repository/shared-role.repo'
import { SharedUserRepo } from '@/shared/shared-repository/shared-user.repo'
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuditLogService } from '@/shared/service/audit-log.service'

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UsersRepository,
    private readonly sharedUserRepo: SharedUserRepo,
    private readonly sharedRoleRepo: SharedRoleRepo,
    private readonly hashingservice: HashingService,
    private readonly sharedGuestRepo: SharedGuestRepo,
    private readonly auditLog: AuditLogService,
    private readonly sharedRefreshTokenRepo: SharedRefreshTokenRepo,
  ) {}

  /**
   * Ghi nhật ký khi **quyền truy cập** của một tài khoản đổi (vai trò hoặc chi nhánh).
   *
   * Đây là đường leo thang quyền thật sự: nâng một nhân viên lên ADMIN, hoặc chuyển họ sang
   * chi nhánh khác để xem dữ liệu chi nhánh đó. Không ghi thì không truy được ai làm.
   * Chỉ ghi khi thật sự có thay đổi — tránh rác log vì mỗi lần bấm "Lưu".
   */
  private async recordAccessChange({
    targetUserId,
    actorId,
    before,
    after,
  }: {
    targetUserId: number
    actorId?: number
    before: { roleId?: number | null; branchId?: number | null }
    after: { roleId?: number | null; branchId?: number | null }
  }) {
    const roleChanged = after.roleId !== undefined && after.roleId !== before.roleId
    const branchChanged = after.branchId !== undefined && after.branchId !== before.branchId
    if (!roleChanged && !branchChanged) return

    await this.auditLog.recordSafe({
      actorId: actorId ?? null,
      action: 'USER_ACCESS_CHANGED',
      entityType: 'USER',
      entityId: targetUserId,
      before: { roleId: before.roleId ?? null, branchId: before.branchId ?? null },
      after: { roleId: after.roleId ?? null, branchId: after.branchId ?? null },
    })
  }

  /**
   * Chi nhánh là **bắt buộc** với tài khoản nhân viên, trừ ADMIN.
   *
   * Vì sao bắt buộc: chi nhánh quyết định dữ liệu người đó đọc được. Tạo nhân viên không có chi
   * nhánh thì họ đăng nhập được nhưng mọi endpoint tài chính trả 403 — rất khó hiểu, và là lỗi
   * cấu hình chứ không phải lỗi nghiệp vụ.
   * ADMIN là cấp tổng nên KHÔNG gán chi nhánh (gán cũng không có tác dụng: admin luôn thấy tất cả).
   */
  private assertBranchForEmployee(roleNameValue: string, branchId?: number | null) {
    if (roleNameValue === roleName.ADMIN) return
    if (!branchId) throw new BadRequestException('Error.BranchRequiredForEmployee')
  }

  /**
   * Update: chỉ chặn khi cố tình **bỏ trống** chi nhánh (`branchId = null`).
   * Không gửi `branchId` = "giữ nguyên", nên sửa tên nhân viên cũ (đang null) vẫn làm được.
   */
  private async assertBranchOnUpdate(userId: number, nextRoleId: number, branchId?: number | null) {
    if (branchId !== null) return
    const role = await this.sharedRoleRepo.findRoleById({ id: nextRoleId, deletedAt: null })
    if (role?.name === roleName.ADMIN) return
    throw new BadRequestException('Error.BranchRequiredForEmployee')
  }

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
      this.assertBranchForEmployee(role.name, body.branchId)
      const Hashpassword = await this.hashingservice.hashPassword(password)
      const created = await this.userRepository.createUser({ ...body, password: Hashpassword, createdById })
      await this.recordAccessChange({
        targetUserId: created.id,
        actorId: createdById,
        before: {},
        after: { roleId: created.roleId, branchId: created.branchId ?? null },
      })
      return created
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
        await this.assertBranchOnUpdate(id, roleId ?? currentUser.roleId, branchId)

        //Kiểm tra người update có quyền được update người khác không
        if (data.roleId && data.roleId != currentUser.roleId) {
          await this.verifyRole({ roleNameAgent: updateByRoleName, roleIdTaget: data.roleId })
        }
        const updated = await this.sharedUserRepo.update(id, {
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
        await this.recordAccessChange({
          targetUserId: id,
          actorId: updatedById,
          before: { roleId: currentUser.roleId, branchId: currentUser.branchId ?? null },
          after: { roleId, branchId },
        })
        return updated
      } else {
        //Lấy thông tin user được update ra và kiểm tra tồm tại
        const currentUser = await this.sharedUserRepo.findUniqueUser({ id })
        if (!currentUser) throw UserNotFoundException
        const { email, name, roleId, avatar, phoneNumber, status, branchId } = data
        //Kiểm tra xem người dùng đó có tự cập nhật role của chính mình không , nếu có thì không cho phép
        this.verifyYourSelf({ userAgentId: id, userTagetId: updatedById })

        // Kiểm tra quyền hiện tại so với quyền mục tiêu
        await this.verifyRole({ roleNameAgent: updateByRoleName, roleIdTaget: currentUser.roleId })
        await this.assertBranchOnUpdate(id, roleId ?? currentUser.roleId, branchId)

        //Kiểm tra người update có quyền được update người khác không
        if (data.roleId && data.roleId != currentUser.roleId) {
          await this.verifyRole({ roleNameAgent: updateByRoleName, roleIdTaget: data.roleId })
        }
        const updated = await this.sharedUserRepo.update(id, {
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
        await this.recordAccessChange({
          targetUserId: id,
          actorId: updatedById,
          before: { roleId: currentUser.roleId, branchId: currentUser.branchId ?? null },
          after: { roleId, branchId },
        })
        return updated
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
    const deleted = await this.userRepository.deleteUser({ id, deletedById, isHard: true })
    // Xoá user (nghỉ việc) phải cắt phiên ngay: refresh token còn sống thì họ vẫn đổi được
    // access token mới. Revoke theo cùng cách với logout — đánh dấu revokedAt, không xoá dòng.
    await this.sharedRefreshTokenRepo.revokeUserRefreshTokens(id)
    return deleted
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
