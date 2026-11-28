import {
  CreateRefreshTokenType,
  RefreshTokenResType,
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

export type RefreshTokenWithUserRole = RefreshTokenResType & {
  user: Omit<UserType, 'password' | 'totpSecret'> & { role: RoleType }
}

/**
 * Kết quả claim một refresh token:
 * - `CLAIMED`: token còn hạn, chưa dùng, chưa thu hồi -> đã đánh dấu `usedAt`, được cấp cặp token mới.
 * - `REUSE`: token tồn tại nhưng đã dùng/bị thu hồi -> cả family vừa bị revoke.
 * - `NOT_FOUND`: không có dòng nào mang hash này.
 */
export type ClaimRefreshTokenResult =
  | { status: 'CLAIMED'; record: RefreshTokenWithUserRole }
  | { status: 'REUSE'; familyId: string }
  | { status: 'NOT_FOUND' }

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

  /**
   * Ghi nhận một lần đăng nhập sai (hoặc khoá tài khoản) lên chính tài khoản đó.
   *
   * `updateMany` + `deletedAt: null` thay cho `update`: tài khoản có thể vừa bị xoá mềm trong
   * lúc đang kiểm mật khẩu, và lúc đó không được ném P2025 — người dùng chỉ cần biết là sai.
   */
  recordLoginFailure(
    userId: number,
    state: { failedAttempts: number; lockedUntil: Date | null },
  ): Promise<{ count: number }> {
    return this.prismaService.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: state,
    })
  }

  /**
   * Xoá dấu vết sai mật khẩu sau khi đăng nhập thành công.
   *
   * Điều kiện `OR` để lần đăng nhập bình thường không phát sinh UPDATE rỗng — login là đường
   * nóng nhất của hệ thống, mỗi lần vào ca đều đi qua đây.
   */
  clearLoginFailures(userId: number): Promise<{ count: number }> {
    return this.prismaService.user.updateMany({
      where: {
        id: userId,
        deletedAt: null,
        OR: [{ failedAttempts: { gt: 0 } }, { lockedUntil: { not: null } }],
      },
      data: { failedAttempts: 0, lockedUntil: null },
    })
  }

  /**
   * Claim nguyên tử + (nếu token đã dùng) thu hồi cả family, trong MỘT transaction.
   *
   * `updateMany({ where: { tokenHash, usedAt: null }, data: { usedAt } })` là điểm chốt: hai
   * request refresh song song cùng một token thì chỉ một request nhận `count = 1`; request còn
   * lại thấy `count = 0` — tức là có kẻ đang dùng lại token cũ — nên bị đá cả family.
   */
  claimRefreshToken(tokenHash: string): Promise<ClaimRefreshTokenResult> {
    const now = new Date()
    return this.prismaService.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { tokenHash, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      })
      const record = await tx.refreshToken.findUnique({
        where: { tokenHash },
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
      if (!record) return { status: 'NOT_FOUND' as const }

      if (count === 0) {
        // Token đã dùng hoặc đã bị thu hồi nhưng vẫn được trình ra: có bản sao đang lưu hành.
        // Không thể biết bản nào là của kẻ tấn công, nên cắt cả family (buộc đăng nhập lại).
        await tx.refreshToken.updateMany({
          where: { familyId: record.familyId, revokedAt: null },
          data: { revokedAt: now },
        })
        return { status: 'REUSE' as const, familyId: record.familyId }
      }

      return { status: 'CLAIMED' as const, record }
    })
  }

  /**
   * Trả một token vừa claim về trạng thái chưa dùng.
   *
   * Claim và insert token kế nhiệm nằm ở hai transaction khác nhau nên không có rollback tự động:
   * cấp token thất bại sẽ để lại một dòng đã "dùng" mà không có token thay thế, và lần thử lại của
   * client sẽ bị coi là dùng lại token cũ. Chỉ gọi hàm này ở nhánh lỗi đó.
   */
  unclaimRefreshToken(tokenHash: string) {
    return this.prismaService.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { usedAt: null },
    })
  }

  findRefreshTokenIncludingRole(where: { tokenHash: string }): Promise<RefreshTokenWithUserRole | null> {
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
}
