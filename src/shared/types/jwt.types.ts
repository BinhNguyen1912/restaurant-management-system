export interface AccessTokenPayloadCreate {
  userId: number
  roleId: number
  roleName: string
}
export interface AccessTokenPayload extends AccessTokenPayloadCreate {
  iat: number
  exp: number
}
export interface GuestRefreshTokenPayloadCreate {
  userId: number
  roleId: number
  roleName: string
  tableNodeId: number
}
export interface RefreshTokenPayloadCreate {
  userId: number
  roleId: number
  roleName: string
}
export interface RefreshTokenPayload extends RefreshTokenPayloadCreate {
  /** định danh duy nhất của lần cấp — thiếu nó thì hai token cùng giây là một chuỗi (xem TokenService) */
  uuid?: string
  iat: number
  exp: number
}
export interface GuestRefreshTokenPayload extends RefreshTokenPayloadCreate {
  /** Bàn của phiên khách — có trong token lúc cấp, cần khi xoay vòng refresh token. */
  tableNodeId: number
  iat: number
  exp: number
}
export interface GuestAccessTokenPayloadCreate extends AccessTokenPayloadCreate {
  tableNodeId: number
}
export interface GuestAccessTokenPayload extends GuestAccessTokenPayloadCreate {
  iat: number
  exp: number
}
