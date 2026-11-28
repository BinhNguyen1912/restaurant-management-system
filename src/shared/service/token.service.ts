import { JwtService } from '@nestjs/jwt'
import configEnv from '../config'
import { v4 as uuidv4 } from 'uuid'
import {
  AccessTokenPayload,
  AccessTokenPayloadCreate,
  GuestAccessTokenPayload,
  GuestAccessTokenPayloadCreate,
  GuestRefreshTokenPayload,
  GuestRefreshTokenPayloadCreate,
  RefreshTokenPayload,
  RefreshTokenPayloadCreate,
  StepUpTokenPayload,
  StepUpTokenPayloadCreate,
} from '../types/jwt.types'
import { STEP_UP_TOKEN_TTL_MINUTES } from '../constants/auth.constant'
import { deriveKey } from '../service/key-derivation'
import { Inject, Injectable } from '@nestjs/common'
import { StringValue } from 'ms'

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}
  async createAcessToken(payload: AccessTokenPayloadCreate ) : Promise<string>{
    return this.jwtService.sign(
      {
        ...payload, uuid: uuidv4()
      },
      {
        secret: configEnv.ACCESS_TOKEN_SECRET,
        expiresIn: configEnv.ACCESS_TOKEN_EXPIRES_IN as StringValue,
        algorithm: 'HS256',
      },
    )
  }
  async createGuestAcessToken(payload: GuestAccessTokenPayloadCreate ):Promise< string> {
    return this.jwtService.sign(
      { ...payload, uuid: uuidv4() },
      {
        secret: configEnv.ACCESS_TOKEN_SECRET,
        expiresIn: configEnv.ACCESS_TOKEN_EXPIRES_IN as StringValue,
        algorithm: 'HS256',
      },
    )
  }
  /**
   * `uuid` ở đây không phải trang trí: payload chỉ có `userId/roleId/roleName` + `iat/exp`, nên hai
   * lần cấp token cho cùng một người trong cùng một GIÂY sinh ra chuỗi y hệt nhau — và
   * `RefreshToken.tokenHash` có unique constraint, nên lần thứ hai là 500 "Unique constraint failed"
   * ngay giữa luồng đăng nhập (bấm đăng nhập hai lần liên tiếp là gặp).
   */
  async createRefreshToken(payload: RefreshTokenPayloadCreate) {
    return this.jwtService.sign(
      { ...payload, uuid: uuidv4() },
      {
        secret: configEnv.REFRESH_TOKEN_SECRET,
        expiresIn: configEnv.REFRESH_TOKEN_EXPIRES_IN as StringValue,
        algorithm: 'HS256',
      },
    )
  }
  /** Cùng lý do `createRefreshToken`: thiếu `uuid` là hai phiên trong cùng một giây đụng unique key */
  async createGuestRefreshToken(payload: GuestRefreshTokenPayloadCreate) {
    return this.jwtService.sign(
      { ...payload, uuid: uuidv4() },
      {
        secret: configEnv.REFRESH_TOKEN_SECRET,
        expiresIn: configEnv.REFRESH_TOKEN_EXPIRES_IN as StringValue,
        algorithm: 'HS256',
      },
    )
  }
  async VerifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: configEnv.ACCESS_TOKEN_SECRET,
    })
  }
  async VerifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: configEnv.REFRESH_TOKEN_SECRET,
    })
  }
  async VerifyGuestAccessToken(token: string): Promise<GuestAccessTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: configEnv.ACCESS_TOKEN_SECRET,
    })
  }
  async VerifyGuestRefreshToken(token: string): Promise<GuestRefreshTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: configEnv.REFRESH_TOKEN_SECRET,
    })
  }
  /**
   * Vé nhập-lại-mật-khẩu (step-up) cho một thao tác nhạy cảm — xem `StepUpGuard`.
   *
   * Ký bằng khoá DẪN XUẤT RIÊNG chứ không dùng thẳng `ACCESS_TOKEN_SECRET`: dùng chung khoá thì
   * một lỗi ở phía verify (quên kiểm `typ`, đảo thứ tự tham số) là đủ để một vé 5 phút sống thành
   * một access token. Ở đây hai khoá khác nhau, nên kể cả khi guard kiểm sai thì chữ ký vẫn không
   * khớp — hai lớp chắn độc lập.
   */
  async createStepUpToken(payload: StepUpTokenPayloadCreate): Promise<string> {
    return this.jwtService.sign(
      { ...payload, typ: 'STEP_UP', uuid: uuidv4() },
      {
        secret: this.stepUpSecret(),
        expiresIn: `${STEP_UP_TOKEN_TTL_MINUTES}m` as StringValue,
        algorithm: 'HS256',
      },
    )
  }
  async VerifyStepUpToken(token: string): Promise<StepUpTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: this.stepUpSecret(),
    })
  }
  private stepUpSecret(): string {
    return deriveKey({
      material: configEnv.ACCESS_TOKEN_SECRET,
      salt: 'res-mana-step-up',
      info: 'step-up-token-v1',
    }).toString('hex')
  }
}
