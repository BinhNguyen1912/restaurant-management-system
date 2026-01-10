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
} from '../types/jwt.types'
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
  async createRefreshToken(payload: RefreshTokenPayloadCreate) {
    return this.jwtService.sign(payload, {
      secret: configEnv.REFRESH_TOKEN_SECRET,
      expiresIn: configEnv.REFRESH_TOKEN_EXPIRES_IN as StringValue,
      algorithm: 'HS256',
    })
  }
  async createGuestRefreshToken(payload: GuestRefreshTokenPayloadCreate) {
    return this.jwtService.sign(payload, {
      secret: configEnv.REFRESH_TOKEN_SECRET,
      expiresIn: configEnv.REFRESH_TOKEN_EXPIRES_IN as StringValue,
      algorithm: 'HS256',
    })
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
}
