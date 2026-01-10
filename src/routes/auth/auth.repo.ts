import {
  CreateRefreshTokenType,
  RefreshTokenResType,
  RefreshTokenType,
  RegisterBodyType,
  RegisterResRepoType,
  RegisterResType,
  VerificationCodeType,
} from '@/routes/auth/auth.model'
import { TypeOfVerificationType } from '@/shared/constants/auth.constant'
import { isUniqueConstraintPrisma } from '@/shared/helper'
import { RoleType } from '@/shared/models/shared-role.model'
import { UserType } from '@/shared/models/shared-user.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class AuthRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async register(
    data: Omit<RegisterBodyType, 'code' | 'confirmPassword'> & Pick<UserType, 'roleId'>,
  ): Promise<RegisterResRepoType> {
    const user = this.prismaService.user.create({
      data,
      omit: {
        password: true,
        totpSecret: true,
      },
    })
    return user
  }
  createVerificationCode(data: VerificationCodeType) {
    try {
      return this.prismaService.verificationCode.create({
        data,
      })
    } catch (error) {
      console.log('Error creating verification code:', error)

      if (isUniqueConstraintPrisma(error)) {
        //Xử lý lỗi trùng code
        // return this.createVerificationCode(data)
      }
    }
  }
  findVerificationCode(
    where: { email_code_type: { email: string; code: string; type: TypeOfVerificationType } } | { id: number },
  ): Promise<VerificationCodeType | null> {
    return this.prismaService.verificationCode.findUnique({
      where,
    })
  }
  deleteVerificationCode(
    where: { id: number } | { email_code_type: { email: string; code: string; type: TypeOfVerificationType } },
  ): Promise<VerificationCodeType> {
    return this.prismaService.verificationCode.delete({
      where,
    })
  }
  createRefreshToken(data: CreateRefreshTokenType): Promise<RefreshTokenResType> {
    return this.prismaService.refreshToken.create({
      data,
    })
  }

  findRefreshToeknIncludeRole(where: {
    token: string
  }): Promise<(RefreshTokenResType & { user: Omit<UserType, 'password' | 'totpSecret'> & { role: RoleType } }) | null> {
    return this.prismaService.refreshToken.findUnique({
      where,
      include: {
        user: {
          include: {
            role: true,
          },
          omit: {
            password: true,
            totpSecret: true,
          },
        },
      },
    })
  }

  deleteRefreshToken(where: { token: string }) {
    return this.prismaService.refreshToken.delete({ where })
  }
}
