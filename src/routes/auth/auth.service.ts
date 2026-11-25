import {
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
import envConfig from '@/shared/config'
import { TypeOfVerification, TypeOfVerificationType } from '@/shared/constants/auth.constant'
import { EmailAlreadyExistsException, InvalidEmailException } from '@/shared/error'
import { generateCode, isNotFoundPrisma } from '@/shared/helper'
import { EmailService } from '@/shared/service/email.service'
import { HashingService } from '@/shared/service/hashing.service'
import { TokenService } from '@/shared/service/token.service'
import { SharedRoleRepo } from '@/shared/shared-repository/shared-role.repo'
import { SharedUserRepo } from '@/shared/shared-repository/shared-user.repo'
import { AccessTokenPayloadCreate } from '@/shared/types/jwt.types'
import { Injectable, UnprocessableEntityException } from '@nestjs/common'
import { addMinutes } from 'date-fns'
import ms, { StringValue } from 'ms'
@Injectable()
export class AuthService {
  constructor(
    private readonly sharedUserRepo: SharedUserRepo,
    private readonly emailService: EmailService,
    private readonly authRepo: AuthRepo,
    private readonly tokenService: TokenService,
    private readonly sharedRoleRepo: SharedRoleRepo,
    private readonly hashingService: HashingService,
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
  async generateTokens(payload: AccessTokenPayloadCreate): Promise<{ accessToken: string; refreshToken: string }> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.createAcessToken(payload),
      this.tokenService.createRefreshToken(payload),
    ])
    const decodeRefreshToken = await this.tokenService.VerifyRefreshToken(refreshToken)
    await this.authRepo.createRefreshToken({
      userId: payload.userId,
      token: refreshToken,
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
    const isPasswordValid = await this.hashingService.comparePassword(data.password, user.password)
    if (!isPasswordValid) {
      throw InvalidPasswordException
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
    return { message: 'Password has been reset successfully' }
  }

  async logout({ refreshToken }: LogoutBodyType) {
    try {
      //kiem tra token con han kh
      await this.tokenService.VerifyRefreshToken(refreshToken)

      //xoa RT trong DB

      const deleteRefreshToken = await this.authRepo.deleteRefreshToken({ token: refreshToken })

      return { message: 'Đằng xuất thành công' }
    } catch (e) {
      if (isNotFoundPrisma(e)) throw RefreshTokenAlreadyUsedException
      throw new UnprocessableEntityException()
    }
  }

  async provideAccessTokenByRefreshToken(refreshTokenBody: RefreshTokenBodyType) {
    const { userId } = await this.tokenService.VerifyRefreshToken(refreshTokenBody.refreshToken)
    const refreshTokenInDB = await this.authRepo.findRefreshToeknIncludeRole({ token: refreshTokenBody.refreshToken })

    if (!refreshTokenInDB) throw RefreshTokenNotFoundOrExpiredException

    const { accessToken, refreshToken } = await this.generateTokens({
      roleId: refreshTokenInDB.user.roleId,
      roleName: refreshTokenInDB.user.role.name,
      userId,
    })
    return {
      accessToken,
      refreshToken,
    }
  }
}
