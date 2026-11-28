import {
  AccountLockedException,
  EmailNotFoundException,
  InvalidPasswordException,
  InvalidTwoFactorCodeException,
  OtpTooManyRequestsException,
  RefreshTokenAlreadyUsedException,
  RefreshTokenNotFoundOrExpiredException,
  TwoFactorAlreadyEnabledException,
  TwoFactorNotSetUpException,
  TwoFactorRequiredException,
  VerificationCodeExpiredException,
  VerificationCodeNotFoundException,
  VerificationCodeTooManyAttemptsException,
} from '@/routes/auth/auth.error'
import {
  DisableTwoFactorBodyType,
  EnableTwoFactorBodyType,
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
import { emailFingerprint } from '@/routes/auth/login-attempt'
import {
  buildTotpUri,
  decryptTotpSecret,
  deriveTotpKey,
  encryptTotpSecret,
  generateTotpSecret,
  secondFactorKind,
  verifyTotpCode,
} from '@/routes/auth/two-factor'
import {
  hashOtpCode,
  isOtpCodeMatch,
  MAX_OTP_SENDS,
  otpSendWindowStart,
  registerOtpMismatch,
} from '@/routes/auth/otp-policy'
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
import { LoginOutcome } from '@prisma/client'
import { Injectable, Logger, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'
import { addMinutes } from 'date-fns'
import ms, { StringValue } from 'ms'
import { v4 as uuidv4 } from 'uuid'
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  /**
   * Khoá mã hoá bí mật TOTP khi lưu DB.
   *
   * Dẫn xuất từ khoá ký JWT nên không cần thêm biến môi trường — và vì dẫn xuất (HKDF) chứ không
   * dùng thẳng, khoá AES không bao giờ trùng byte với khoá ký. Hệ quả phải biết: **đổi
   * `ACCESS_TOKEN_SECRET` là mọi bí mật 2FA đã lưu không giải mã được nữa**, người dùng phải setup
   * lại. Ghi ở docs/prod-readiness-plan.md.
   */
  private readonly totpKey = deriveTotpKey(envConfig.ACCESS_TOKEN_SECRET)

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

  /**
   * Kiểm mã OTP và claim luôn lượt dùng (prod-readiness M1).
   *
   * Không còn tra mã bằng plaintext: DB chỉ giữ `sha256(code)`, nên lấy mã đang sống của
   * `(email, type)` rồi so hash. Nhờ tra theo cặp đó mới gắn được bộ đếm lượt sai vào đúng dòng
   * mã — trước đây mỗi mã là một dòng vô danh, nhập sai bao nhiêu lần cũng không ai đếm.
   *
   * Claim một lần dùng ở đây thay cho `delete` ở nơi gọi: trước kia nơi gọi kiểm xong mới xoá, nên
   * hai request song song cùng một mã đều đi qua được cửa kiểm.
   */
  async verificationCode(payload: { email: string; code: string; type: TypeOfVerificationType }) {
    const record = await this.authRepo.findActiveVerificationCode({ email: payload.email, type: payload.type })
    if (!record) {
      throw VerificationCodeNotFoundException
    }
    //Xét điều kiện còn hạn hay hết hạn
    if (record.expiresAt.getTime() < Date.now()) {
      throw VerificationCodeExpiredException
    }
    if (!isOtpCodeMatch(record.codeHash, payload.code)) {
      const outcome = registerOtpMismatch(record.attempts)
      await this.authRepo.incrementVerificationAttempt(record.id)
      if (outcome.exhausted) {
        // Hết lượt thì vô hiệu luôn: để mã sống tiếp chỉ kéo dài cuộc dò tới lúc hết hạn.
        await this.authRepo.consumeVerificationCode(record.id)
        throw VerificationCodeTooManyAttemptsException
      }
      throw VerificationCodeNotFoundException
    }
    if ((await this.authRepo.consumeVerificationCode(record.id)) === 0) {
      // Request khác vừa dùng đúng mã này xong — mã một lần, không có vé thứ hai.
      throw VerificationCodeNotFoundException
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

    const now = new Date()
    const code = generateCode()
    const issued = await this.authRepo.issueVerificationCode({
      email: payload.email,
      type: payload.type,
      codeHash: hashOtpCode(code),
      expiresAt: addMinutes(now, ms(envConfig.OTP_EXPIRES_IN as StringValue)),
      windowStart: otpSendWindowStart(now),
      maxSends: MAX_OTP_SENDS,
    })
    // Chặn trước khi gọi nhà cung cấp email: đã quá ngưỡng thì không có mã nào để gửi.
    if (issued.status === 'RATE_LIMITED') {
      throw OtpTooManyRequestsException
    }

    const { error } = await this.emailService.sendEmail({ email: payload.email, code })
    if (error) {
      // Gửi hỏng thì trả lại lượt: khách chưa nhận được mã mà vẫn bị tính một lượt thì sau 5 lần
      // thử lại họ tự khoá mình khỏi luồng đăng ký.
      await this.authRepo.deleteVerificationCode(issued.record.id)
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
    //Xác thực mã otp — mã bị claim (đánh dấu đã dùng) ngay trong bước kiểm
    await this.verificationCode({ email, code, type: TypeOfVerification.REGISTER })

    const hashPassword = await this.hashingService.hashPassword(password)
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

  /**
   * Ghi một lần thử đăng nhập vào nhật ký bảo mật (`LoginAttempt`).
   *
   * Best-effort giống `LOGIN_LOCKED`: bảng nhật ký có sự cố thì không được biến lần đăng nhập đúng
   * thành 500, cũng không được che mất lý do "sai mật khẩu" mà người dùng đang chờ.
   */
  private async recordLoginAttempt(input: {
    email: string
    actorId: number | null
    outcome: LoginOutcome
    ip: string | null
  }) {
    await this.authRepo
      .recordLoginAttempt({
        emailHash: emailFingerprint(input.email),
        actorId: input.actorId,
        outcome: input.outcome,
        ip: input.ip,
      })
      .catch((error) => this.logger.warn(`Không ghi được nhật ký đăng nhập ${input.outcome}: ${error}`))
  }

  /**
   * Ghi nhận một lần trình SAI chứng thứ và khoá tài khoản khi chạm ngưỡng.
   *
   * Dùng cho cả sai mật khẩu và sai mã 2FA: mã TOTP chỉ có 10^6 khả năng, nếu sai mã không vào
   * chung bộ đếm này thì dò 6 số là việc của vài giờ chứ không phải của vài thế kỷ.
   *
   * Trả `justLocked` để nơi gọi chọn thông báo: "gõ lại đi" khác hẳn "chờ 15 phút".
   */
  private async registerWrongCredential(
    user: { id: number; failedAttempts?: number | null; lockedUntil?: Date | null },
    email: string,
    ip: string | null,
    now: Date,
  ) {
    const outcome = registerFailedAttempt(
      { failedAttempts: user.failedAttempts ?? 0, lockedUntil: user.lockedUntil ?? null },
      now,
    )
    await this.authRepo.recordLoginFailure(user.id, {
      failedAttempts: outcome.failedAttempts,
      lockedUntil: outcome.lockedUntil,
    })
    await this.recordLoginAttempt({ email, actorId: user.id, outcome: 'FAILED', ip })
    if (outcome.justLocked) {
      // Nhật ký best-effort: chặn được kẻ dò quan trọng hơn một dòng log, nên lỗi ghi audit không
      // được biến lần thử thứ 5 thành 500.
      await this.auditLogService
        .record({
          action: 'LOGIN_LOCKED',
          entityType: 'USER',
          entityId: user.id,
          reason: `Sai chứng thứ đăng nhập ${MAX_FAILED_ATTEMPTS} lần liên tiếp`,
          after: { failedAttempts: MAX_FAILED_ATTEMPTS, lockedUntil: outcome.lockedUntil?.toISOString() ?? null },
        })
        .catch((error) => this.logger.warn(`Không ghi được audit LOGIN_LOCKED cho user ${user.id}: ${error}`))
    }
    return outcome
  }

  async login(data: LoginBodyType, context: { ip?: string | null } = {}) {
    const ip = context.ip ?? null
    const user = await this.sharedUserRepo.findUserIncludeRolePermissions({ email: data.email })

    if (!user) {
      // Email không tồn tại vẫn để lại dấu: chỉ ghi khi có tài khoản thì màn dò "địa chỉ nào có
      // trong hệ thống" — vốn không bao giờ khoá được tài khoản nào — sẽ không hiện ở đâu cả.
      await this.recordLoginAttempt({ email: data.email, actorId: null, outcome: 'FAILED', ip })
      throw InvalidEmailException
    }
    // Kiểm khoá TRƯỚC khi so mật khẩu: đang khoá thì mật khẩu đúng cũng không được cấp token, và
    // mỗi lần thử của kẻ dò không còn tốn một lượt băm scrypt của server.
    const now = new Date()
    const lock = evaluateLoginLock(user.lockedUntil, now)
    if (lock.locked) {
      // Vẫn ghi: một lần thử trong lúc đang khoá là dấu hiệu có người tiếp tục dò, không phải nhiễu.
      await this.recordLoginAttempt({ email: data.email, actorId: user.id, outcome: 'FAILED', ip })
      throw AccountLockedException(lock.remainingMs)
    }

    const isPasswordValid = await this.hashingService.comparePassword(data.password, user.password)
    if (!isPasswordValid) {
      const outcome = await this.registerWrongCredential(user, data.email, ip, now)
      if (!outcome.justLocked) {
        throw InvalidPasswordException
      }
      throw AccountLockedException(LOCK_MINUTES * 60 * 1000)
    }
    // 2FA: mật khẩu đúng mới tới được đây, nên chỗ này là cửa duy nhất phải kiểm yếu tố thứ hai.
    if (user.twoFactorEnabled) {
      const factor = secondFactorKind({ totpCode: data.totpCode, emailCode: data.code })
      if (factor === 'NONE') {
        // Mật khẩu ĐÚNG, request chỉ chưa gửi mã. Không tính vào bộ đếm sai và không ghi FAILED:
        // người dùng thật sẽ gõ mã ở lượt kế tiếp, còn ghi vào đây là tự bắn tín hiệu động vào
        // nhật ký dò mật khẩu.
        throw TwoFactorRequiredException
      }
      if (factor === 'EMAIL') {
        // Mã email có bộ đếm sai và thông báo riêng (hết hạn / hết lượt / hết hạn gửi lại) — không
        // gộp về "mã 2FA sai" chung, người dùng cần biết phải xin mã mới hay chỉ gõ lại.
        await this.verificationCode({ email: user.email, code: data.code as string, type: TypeOfVerification.LOGIN })
      } else {
        const plainSecret = decryptTotpSecret(user.totpSecret, this.totpKey)
        if (!plainSecret || !verifyTotpCode(plainSecret, data.totpCode as string)) {
          const outcome = await this.registerWrongCredential(user, data.email, ip, now)
          if (!outcome.justLocked) {
            throw InvalidTwoFactorCodeException
          }
          throw AccountLockedException(LOCK_MINUTES * 60 * 1000)
        }
      }
    }
    // Chỉ xoá bộ đếm khi đã qua ĐỦ hai yếu tố: gõ đúng mật khẩu mà mã 2FA sai thì lượt đó vẫn là
    // một lượt thử sai. Nhưng phải xoá trước khi cấp token — nhân viên gõ sai vài lần rồi vào được
    // mà bộ đếm còn nguyên thì lần sai kế tiếp (dù cách đó nhiều ngày) sẽ khoá oan.
    if (user.failedAttempts > 0 || user.lockedUntil) {
      await this.authRepo.clearLoginFailures(user.id)
    }
    const { accessToken, refreshToken } = await this.generateTokens({
      userId: user.id,
      roleId: user.roleId,
      roleName: user.role.name,
    })

    // Ghi SAU khi đã cấp token: cấp token hỏng thì không phiên nào được mở, ghi SUCCESS lúc đó là
    // nói dối về một lần đăng nhập chưa xảy ra.
    await this.recordLoginAttempt({ email: data.email, actorId: user.id, outcome: 'SUCCESS', ip })

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

  /**
   * Bước 1 để bật 2FA: sinh bí mật, trả URI cho FE vẽ QR, lưu bí mật ở trạng thái CHỜ.
   *
   * Bí mật chỉ trả về đúng lần này. Gọi lại (quét hỏng, đổi điện thoại) thì sinh bí mật mới và ghi
   * đè bí mật đang chờ — bí mật cũ chết ngay, không có hai bí mật cùng sống cho một tài khoản.
   */
  async setupTwoFactor(userId: number): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.sharedUserRepo.findUniqueUser({ id: userId })
    if (!user) {
      // Route đã qua guard, nên chỉ tới đây khi tài khoản bị xoá ngay giữa phiên.
      throw new UnauthorizedException('Error.UserNotFound')
    }
    if (user.twoFactorEnabled) {
      throw TwoFactorAlreadyEnabledException
    }
    const secret = generateTotpSecret()
    await this.authRepo.savePendingTotpSecret(userId, encryptTotpSecret(secret, this.totpKey))
    return { secret, otpauthUri: buildTotpUri(user.email, secret) }
  }

  /**
   * Bước 2: xác nhận được một mã từ ứng dụng xác thực rồi mới bật.
   *
   * Thứ tự này là điều kiện sống còn, không phải chi tiết: bật trước khi chứng minh điện thoại đã
   * có bí mật nghĩa là một lần quét hỏng là tài khoản tự khoá mình ra ngoài, và đường vào duy nhất
   * còn lại là sửa thẳng DB.
   */
  async enableTwoFactor(userId: number, data: EnableTwoFactorBodyType) {
    const user = await this.sharedUserRepo.findUniqueUser({ id: userId })
    if (!user) throw new UnauthorizedException('Error.UserNotFound')

    const plainSecret = decryptTotpSecret(user.totpSecret, this.totpKey)
    if (!plainSecret) {
      // Chưa setup, hoặc bí mật hỏng vì khoá mã hoá đã đổi. Cả hai đều phải setup lại từ đầu.
      throw TwoFactorNotSetUpException
    }
    if (!verifyTotpCode(plainSecret, data.totpCode)) {
      throw InvalidTwoFactorCodeException
    }

    await this.authRepo.enableTwoFactor(userId, new Date())
    await this.auditLogService
      .record({
        action: 'TWO_FACTOR_ENABLED',
        entityType: 'USER',
        entityId: userId,
        after: { twoFactorEnabled: true },
      })
      .catch((error) => this.logger.warn(`Không ghi được audit TWO_FACTOR_ENABLED cho user ${userId}: ${error}`))
    return { message: 'Đã bật xác thực hai lớp' }
  }

  /**
   * Tắt 2FA — đòi **mật khẩu và một yếu tố thứ hai**, không chỉ mật khẩu.
   *
   * Chỉ mật khẩu là không đủ: kẻ chiếm được phiên (token trong máy khác) chỉ cần chờ chủ tài khoản
   * gõ mật khẩu ở đâu đó một lần là tháo được rào chắn, và 2FA thành vô nghĩa đúng ở tình huống nó
   * sinh ra để chặn. Đường khôi phục khi mất điện thoại là OTP qua email (`code`), không phải bỏ
   * kiểm.
   */
  async disableTwoFactor(userId: number, data: DisableTwoFactorBodyType) {
    const user = await this.sharedUserRepo.findUniqueUser({ id: userId })
    if (!user) throw new UnauthorizedException('Error.UserNotFound')
    if (!user.twoFactorEnabled) {
      // Idempotent như logout: gọi lại không phải lỗi, chỉ là không còn gì để tắt.
      return { message: 'Tài khoản này chưa bật xác thực hai lớp' }
    }

    const isPasswordValid = await this.hashingService.comparePassword(data.password, user.password)
    if (!isPasswordValid) {
      // Không đếm vào bộ đếm khoá đăng nhập: kẻ gọi được route này đã cầm một phiên hợp lệ, còn khoá
      // tài khoản ở đây là trao cho họ nút bấm làm chủ tài khoản tự khoá mình.
      throw InvalidPasswordException
    }
    const factor = secondFactorKind({ totpCode: data.totpCode, emailCode: data.code })
    if (factor === 'NONE') {
      throw TwoFactorRequiredException
    }
    if (factor === 'EMAIL') {
      await this.verificationCode({ email: user.email, code: data.code as string, type: TypeOfVerification.LOGIN })
    } else {
      const plainSecret = decryptTotpSecret(user.totpSecret, this.totpKey)
      if (!plainSecret || !verifyTotpCode(plainSecret, data.totpCode as string)) {
        throw InvalidTwoFactorCodeException
      }
    }

    await this.authRepo.disableTwoFactor(userId)
    await this.auditLogService
      .record({
        action: 'TWO_FACTOR_DISABLED',
        entityType: 'USER',
        entityId: userId,
        before: { twoFactorEnabled: true },
        after: { twoFactorEnabled: false },
        reason: 'Người dùng tự tắt sau khi nhập lại mật khẩu và mã thứ hai',
      })
      .catch((error) => this.logger.warn(`Không ghi được audit TWO_FACTOR_DISABLED cho user ${userId}: ${error}`))
    return { message: 'Đã tắt xác thực hai lớp' }
  }

  async forgotPassword(data: ForgotPasswordType) {
    const { code, email } = data
    const checkEmail = await this.sharedUserRepo.findUniqueUser({ email })
    if (!checkEmail) throw EmailNotFoundException

    // Mã đã bị claim ngay trong bước kiểm nên ở đây không còn dòng nào để xoá.
    await this.verificationCode({ email, code, type: TypeOfVerification.FORGOT_PASSWORD })
    await this.sharedUserRepo.update(checkEmail.id, {
      password: await this.hashingService.hashPassword(data.newPassword),
    })
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
