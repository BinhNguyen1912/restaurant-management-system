import {
  AccountLockedException,
  EmailNotFoundException,
  InvalidPasswordException,
  RefreshTokenAlreadyUsedException,
  RefreshTokenNotFoundOrExpiredException,
  VerificationCodeExpiredException,
  VerificationCodeNotFoundException,
} from '@/routes/auth/auth.error'
import {
  ForgotPasswordType,
  LoginBodyType,
  LogoutBodyType,
  RefreshTokenBodyType,
  RegisterBodyType,
} from '@/routes/auth/auth.model'
import { AuthRepo } from '@/routes/auth/auth.repo'
import {
  evaluateLoginLock,
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  registerFailedAttempt,
} from '@/routes/auth/login-lockout'
import envConfig from '@/shared/config'
import { TypeOfVerification, TypeOfVerificationType } from '@/shared/constants/auth.constant'
import { EmailAlreadyExistsException, InvalidEmailException } from '@/shared/error'
import { generateCode } from '@/shared/helper'
import { AuditLogService } from '@/shared/service/audit-log.service'
import { EmailService } from '@/shared/service/email.service'
import { HashingService } from '@/shared/service/hashing.service'
import { hashRefreshToken } from '@/shared/service/token-hash'
import { TokenService } from '@/shared/service/token.service'
import { SharedRefreshTokenRepo } from '@/shared/shared-repository/shared-refreshToken'
import { SharedRoleRepo } from '@/shared/shared-repository/shared-role.repo'
import { SharedUserRepo } from '@/shared/shared-repository/shared-user.repo'
import { AccessTokenPayloadCreate, RefreshTokenPayload } from '@/shared/types/jwt.types'
import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common'
import { addMinutes } from 'date-fns'
import ms, { StringValue } from 'ms'
import { v4 as uuidv4 } from 'uuid'
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly sharedUserRepo: SharedUserRepo,
    private readonly emailService: EmailService,
    private readonly authRepo: AuthRepo,
    private readonly tokenService: TokenService,
    private readonly sharedRoleRepo: SharedRoleRepo,
    private readonly hashingService: HashingService,
    private readonly sharedRefreshTokenRepo: SharedRefreshTokenRepo,
    private readonly auditLogService: AuditLogService,
  ) {}

  async verificationCode(payload: { email: string; code: string; type: TypeOfVerificationType }) {
    const record = await this.authRepo.findVerificationCode({
      email_code_type: payload,
    })
    if (!record) {
      throw VerificationCodeNotFoundException
    }
    //Xét điều kiện còn hạn hay hết hạn
    if (new Date(record.expiresAt) < new Date()) {
      throw VerificationCodeExpiredException
    }
    return record
  }
  /**
   * Cấp cặp token và lưu refresh token (dạng hash) vào DB.
   *
   * `familyId` chỉ truyền khi refresh — mọi lượt xoay vòng nằm trong cùng family của lần login,
   * nhờ vậy phát hiện dùng lại token cũ là cắt được toàn bộ chuỗi.
   */
  async generateTokens(
    payload: AccessTokenPayloadCreate,
    familyId: string = uuidv4(),
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.createAcessToken(payload),
      this.tokenService.createRefreshToken(payload),
    ])
    const decodeRefreshToken = await this.tokenService.VerifyRefreshToken(refreshToken)
    await this.authRepo.createRefreshToken({
      userId: payload.userId,
      tokenHash: hashRefreshToken(refreshToken),
      familyId,
      expiresAt: new Date(decodeRefreshToken.exp * 1000),
    })

    return { accessToken, refreshToken }
  }
  async sendOTP(payload: { email: string; type: TypeOfVerificationType }) {
    const checkEmail = await this.sharedUserRepo.findUniqueUser({ email: payload.email })
    //Kiểm tra các điều kiện
    //Nếu type là đăng ký nhưng email bị trùng

    if (checkEmail && payload.type === TypeOfVerification.REGISTER) {
      throw EmailAlreadyExistsException
    }
    //nếu quên mật khẩu mà email không tồn tại
    if (!checkEmail && payload.type === TypeOfVerification.FORGOT_PASSWORD) {
      throw InvalidEmailException
    }

    const code = generateCode()
    const verificationCode = await this.authRepo.createVerificationCode({
      email: payload.email,
      code,
      type: payload.type,
      expiresAt: addMinutes(new Date(), ms(envConfig.OTP_EXPIRES_IN as StringValue)),
    })

    const { error } = await this.emailService.sendEmail({ email: payload.email, code })
    if (error) {
      throw error
    }
    return { message: 'Send OTP Success. Please Check OTP In Your Email' }
  }
  async register(data: RegisterBodyType) {
    const { code, email, name, password, phoneNumber } = data
    const roleClient = await this.sharedRoleRepo.getRoleClient()
    //Xác thực Email
    const checkEmail = await this.sharedUserRepo.findUniqueUser({ email })
    if (checkEmail) {
      throw EmailAlreadyExistsException
    }
    //Xác thực mã otp
    await this.verificationCode({ email, code, type: TypeOfVerification.REGISTER })

    //Xoa mã otp đã sử dụng
    const hashPassword = await this.hashingService.hashPassword(password)
    await this.authRepo.deleteVerificationCode({ email_code_type: { email, code, type: TypeOfVerification.REGISTER } })
    const user = await this.authRepo.register({
      email,
      name,
      password: hashPassword,
      phoneNumber,
      roleId: roleClient.roleId,
    })
    const { accessToken, refreshToken } = await this.generateTokens({
      userId: user.id,
      roleId: user.roleId,
      roleName: roleClient.roleName,
    })
    return {
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, roleName: roleClient.roleName },
      accessToken,
      refreshToken,
    }
  }

  async login(data: LoginBodyType) {
    const user = await this.sharedUserRepo.findUserIncludeRolePermissions({ email: data.email })

    if (!user) {
      throw InvalidEmailException
    }
    // Kiểm khoá TRƯỚC khi so mật khẩu: đang khoá thì mật khẩu đúng cũng không được cấp token, và
    // mỗi lần thử của kẻ dò không còn tốn một lượt băm scrypt của server.
    const now = new Date()
    const lock = evaluateLoginLock(user.lockedUntil, now)
    if (lock.locked) {
      throw AccountLockedException(lock.remainingMs)
    }

    const isPasswordValid = await this.hashingService.comparePassword(data.password, user.password)
    if (!isPasswordValid) {
      const outcome = registerFailedAttempt({ failedAttempts: user.failedAttempts ?? 0, lockedUntil: user.lockedUntil ?? null }, now)
      await this.authRepo.recordLoginFailure(user.id, {
        failedAttempts: outcome.failedAttempts,
        lockedUntil: outcome.lockedUntil,
      })
      if (!outcome.justLocked) {
        throw InvalidPasswordException
      }
      // Nhật ký best-effort: chặn được kẻ dò mật khẩu quan trọng hơn một dòng log, nên lỗi ghi
      // audit không được biến lần thử thứ 5 thành 500.
      await this.auditLogService
        .record({
          action: 'LOGIN_LOCKED',
          entityType: 'USER',
          entityId: user.id,
          reason: `Sai mật khẩu ${MAX_FAILED_ATTEMPTS} lần liên tiếp`,
          after: { failedAttempts: MAX_FAILED_ATTEMPTS, lockedUntil: outcome.lockedUntil?.toISOString() ?? null },
        })
        .catch((error) => this.logger.warn(`Không ghi được audit LOGIN_LOCKED cho user ${user.id}: ${error}`))
      throw AccountLockedException(LOCK_MINUTES * 60 * 1000)
    }
    // Đăng nhập đúng phải xoá dấu vết sai trước đó: nhân viên gõ sai vài lần rồi gõ đúng mà bộ đếm
    // còn nguyên thì lần sai kế tiếp (dù cách đó nhiều ngày) sẽ khoá oan.
    if (user.failedAttempts > 0 || user.lockedUntil) {
      await this.authRepo.clearLoginFailures(user.id)
    }
    const { accessToken, refreshToken } = await this.generateTokens({
      userId: user.id,
      roleId: user.roleId,
      roleName: user.role.name,
    })

    // Chi nhánh nhân viên thuộc về (null = chưa gán). FE hiện ngay trên header để người dùng biết
    // mình đang thao tác dữ liệu của chi nhánh nào — sai chi nhánh là sai số liệu, không báo lỗi.
    const branch = user.branchId
      ? await this.sharedUserRepo.findBranchOfUser(user.id)
      : null

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        roleName: user.role.name,
        branchId: user.branchId ?? null,
        branch,
      },
      accessToken,
      refreshToken,
    }
  }

  async forgotPassword(data: ForgotPasswordType) {
    const { code, email } = data
    const checkEmail = await this.sharedUserRepo.findUniqueUser({ email })
    if (!checkEmail) throw EmailNotFoundException

    await this.verificationCode({ email, code, type: TypeOfVerification.FORGOT_PASSWORD })
    const [user] = await Promise.all([
      this.sharedUserRepo.update(checkEmail.id, {
        password: await this.hashingService.hashPassword(data.newPassword),
      }),
      this.authRepo.deleteVerificationCode({
        email_code_type: { email, code, type: TypeOfVerification.FORGOT_PASSWORD },
      }),
    ])
    // Đổi mật khẩu phải cắt mọi phiên cũ: kẻ đã chiếm được refresh token thì đổi mật khẩu
    // không còn ý nghĩa gì nếu phiên cũ vẫn sống tiếp
    await this.sharedRefreshTokenRepo.revokeUserRefreshTokens(checkEmail.id)
    return { message: 'Password has been reset successfully' }
  }

  /**
   * Đăng xuất thu hồi **toàn bộ** refresh token của user, không chỉ token gửi lên: người dùng bấm
   * "đăng xuất" trên một thiết bị nhưng token ở thiết bị khác cũng phải chết.
   * Gọi lại nhiều lần vẫn trả cùng một kết quả (revoke là idempotent).
   */
  async logout({ refreshToken }: LogoutBodyType) {
    let payload: RefreshTokenPayload
    try {
      //kiểm tra token còn hạn và đúng chữ ký
      payload = await this.tokenService.VerifyRefreshToken(refreshToken)
    } catch {
      throw new UnprocessableEntityException()
    }

    await this.sharedRefreshTokenRepo.revokeUserRefreshTokens(payload.userId)

    return { message: 'Đằng xuất thành công' }
  }

  /**
   * Đổi refresh token lấy cặp token mới.
   *
   * Không đọc thẳng payload JWT để lấy quyền: claim token trong DB (nguyên tử) rồi đọc lại dòng
   * vừa claim — quyền/role lấy từ DB nên đổi quyền có hiệu lực ngay ở lượt refresh kế tiếp.
   */
  async provideAccessTokenByRefreshToken(refreshTokenBody: RefreshTokenBodyType) {
    // Token rác/hết hạn bị chặn trước khi chạm DB.
    await this.tokenService.VerifyRefreshToken(refreshTokenBody.refreshToken)

    const presentedTokenHash = hashRefreshToken(refreshTokenBody.refreshToken)
    const claim = await this.authRepo.claimRefreshToken(presentedTokenHash)

    // Không có dòng nào: token chưa từng được cấp (hoặc DB đã dọn) => 401.
    if (claim.status === 'NOT_FOUND') throw RefreshTokenNotFoundOrExpiredException
    // Có dòng nhưng đã dùng/bị thu hồi: repo vừa revoke cả family => 401.
    if (claim.status === 'REUSE') throw RefreshTokenAlreadyUsedException

    try {
      return await this.generateTokens(
        {
          roleId: claim.record.user.roleId,
          roleName: claim.record.user.role.name,
          userId: claim.record.userId,
        },
        claim.record.familyId,
      )
    } catch (error) {
      // Cấp token kế nhiệm thất bại sau khi đã claim: để nguyên thì token vừa trình ra ở trạng thái
      // "đã dùng" mà không có token thay thế, lần thử lại của client sẽ bị coi là dùng lại token cũ
      // và revoke cả family — một lỗi DB tạm thời hoá thành đăng xuất mọi thiết bị của user.
      await this.authRepo.unclaimRefreshToken(presentedTokenHash)
      throw error
    }
  }
}
