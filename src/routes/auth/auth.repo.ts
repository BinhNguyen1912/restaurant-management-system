import {
  CreateRefreshTokenType,
  RefreshTokenResType,
  RegisterBodyType,
  RegisterResRepoType,
  RegisterResType,
  VerificationCodeRecordType,
} from '@/routes/auth/auth.model'
import { TypeOfVerificationType } from '@/shared/constants/auth.constant'
import { RoleType } from '@/shared/models/shared-role.model'
import { UserType } from '@/shared/models/shared-user.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { LoginOutcome } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { subDays } from 'date-fns'

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

/**
 * Kết quả phát OTP:
 * - `RATE_LIMITED`: đã gửi quá ngưỡng trong cửa sổ 15 phút — không tạo mã, không gửi email;
 * - `ISSUED`: dòng mã vừa tạo (mã cũ cùng `(email, type)` đã bị vô hiệu trong cùng transaction).
 */
export type IssueVerificationCodeResult = { status: 'RATE_LIMITED' } | { status: 'ISSUED'; record: VerificationCodeRecordType }

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
  /**
   * Phát một mã OTP mới.
   *
   * Ba việc trong MỘT transaction, vì tách ra là có khe:
   * - đếm lượt gửi trong cửa sổ 15 phút (chặn việc biến server thành máy bắn email);
   * - vô hiệu mã cũ cùng `(email, type)` — để hai mã cùng sống là cấp cho kẻ dò hai vé thay vì một;
   * - tạo dòng mới, chỉ ghi `sha256(code)`.
   *
   * `deleteMany` dọn dòng quá cũ của chính `(email, type)` này: bảng chỉ phục vụ cửa sổ 15 phút,
   * giữ mãi thì mỗi lượt đăng ký của khách để lại một dòng rác vĩnh viễn.
   */
  async issueVerificationCode(input: {
    email: string
    type: TypeOfVerificationType
    codeHash: string
    expiresAt: Date
    windowStart: Date
    maxSends: number
  }): Promise<IssueVerificationCodeResult> {
    const now = new Date()
    return this.prismaService.$transaction(async (tx) => {
      const sentInWindow = await tx.verificationCode.count({
        where: { email: input.email, type: input.type, createdAt: { gte: input.windowStart } },
      })
      if (sentInWindow >= input.maxSends) return { status: 'RATE_LIMITED' as const }

      await tx.verificationCode.deleteMany({
        where: { email: input.email, type: input.type, createdAt: { lt: subDays(now, 1) } },
      })
      await tx.verificationCode.updateMany({
        where: { email: input.email, type: input.type, consumedAt: null },
        data: { consumedAt: now },
      })
      const record = await tx.verificationCode.create({
        data: {
          email: input.email,
          type: input.type,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
        },
      })
      return { status: 'ISSUED' as const, record }
    })
  }

  /** Mã đang sống (chưa dùng, chưa bị mã mới thay thế) mới nhất của `(email, type)` */
  findActiveVerificationCode(where: {
    email: string
    type: TypeOfVerificationType
  }): Promise<VerificationCodeRecordType | null> {
    return this.prismaService.verificationCode.findFirst({
      where: { ...where, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** Cộng một lượt nhập sai, trả tổng số lượt sau khi cộng */
  async incrementVerificationAttempt(id: number): Promise<number> {
    const { attempts } = await this.prismaService.verificationCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    return attempts
  }

  /**
   * Đánh dấu mã đã dùng; trả số dòng vừa claim.
   *
   * `updateMany({ consumedAt: null })` là điểm chốt một-lần-dùng: hai request cùng trình một mã
   * thì chỉ một request nhận `count = 1`, request còn lại không có vé thứ hai.
   */
  async consumeVerificationCode(id: number): Promise<number> {
    const { count } = await this.prismaService.verificationCode.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    return count
  }

  /** Xoá dòng mã — chỉ dùng khi gửi email hỏng, để lượt gửi không bị đốt oan */
  async deleteVerificationCode(id: number): Promise<number> {
    const { count } = await this.prismaService.verificationCode.deleteMany({ where: { id } })
    return count
  }
  /**
   * Ghi một lần thử đăng nhập vào nhật ký bảo mật (`LoginAttempt`).
   *
   * Chỉ INSERT: bảng có trigger chặn UPDATE, nên sửa lại "lịch sử đăng nhập" là việc DB không cho.
   * Không nằm trong transaction nào — đăng nhập thất bại phải để lại dấu vết kể cả khi phần còn lại
   * của luồng ném lỗi ngay sau đó.
   */
  recordLoginAttempt(input: {
    emailHash: string
    actorId: number | null
    outcome: LoginOutcome
    ip: string | null
  }): Promise<{ id: number }> {
    return this.prismaService.loginAttempt.create({ data: input, select: { id: true } })
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
