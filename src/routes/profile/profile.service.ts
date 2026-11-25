import { Injectable } from '@nestjs/common'
import { ProfileRepository } from './profile.repo'
import { ChangePasswordType, UpdateMeBodyType } from './profile.model'
import { IncorrectPasswordException, NewPasswordMustBeDifferentException, UserNotFoundException } from './profile.error'
import { HashingService } from '@/shared/service/hashing.service'
import { SharedUserRepo } from '@/shared/shared-repository/shared-user.repo'
import { isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'

@Injectable()
export class ProfileService {
  constructor(
    private readonly sharedUserRepo: SharedUserRepo,
    private readonly hashingservice: HashingService,
  ) {}

  async getProfile(userId: number) {
    const user = await this.sharedUserRepo.findUserIncludeRolePermissions({ id: userId })

    if (!user) throw UserNotFoundException

    // Kèm chi nhánh: header cần biết người dùng đang thao tác trên chi nhánh nào, và phải giữ
    // được sau khi F5 (không chỉ ngay sau khi login).
    const branch = await this.sharedUserRepo.findBranchOfUser(userId)
    return { ...user, branch: branch ?? null }
  }

  async updateProfile({ data, userId }: { userId: number; data: Partial<UpdateMeBodyType> }) {
    try {
      return await this.sharedUserRepo.update(userId, {
        ...data,
        updatedById: userId,
      })
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw UserNotFoundException
      }
      if (isUniqueConstraintPrisma(error)) {
        throw UserNotFoundException
      }
      throw error
    }
  }

  async ChangePassword({ body, id }: { id: number; body: ChangePasswordType }) {
    try {
      const { password, newPassword } = body

      const user = await this.sharedUserRepo.findUniqueUser({ id })
      if (!user) throw UserNotFoundException

      const isMatch = await this.hashingservice.comparePassword(password, user.password)

      if (!isMatch) {
        throw IncorrectPasswordException
      }

      const Hashpassword = await this.hashingservice.hashPassword(newPassword)

      if (newPassword == password) {
        throw NewPasswordMustBeDifferentException
      }
      const data = await this.sharedUserRepo.update(id, {
        password: Hashpassword,
      })
      return data
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw UserNotFoundException
      }
      if (isUniqueConstraintPrisma(error)) {
        throw UserNotFoundException
      }
      throw error
    }
  }
}
