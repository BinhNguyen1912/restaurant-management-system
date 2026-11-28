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

/**
 * Vé "vừa nhập lại mật khẩu" (step-up) cho một thao tác nhạy cảm — xem `StepUpGuard`.
 *
 * Cố ý KHÔNG có `roleId`/`roleName`: vé này không phải một phiên đăng nhập, nó chỉ trả lời câu
 * "người đang giữ access token này đã gõ lại mật khẩu trong 5 phút vừa rồi". Thiếu role cũng là
 * một lớp chắn: đem vé này đi làm Bearer token thì `AccessTokenGuard` từ chối vì không có quyền để
 * tra, chứ không phải chỉ nhờ khác khoá ký.
 */
export interface StepUpTokenPayloadCreate {
  userId: number
}

export interface StepUpTokenPayload extends StepUpTokenPayloadCreate {
  /** dấu loại token — kiểm lại ở guard, để một token khác payload không lọt qua cùng khoá */
  typ: 'STEP_UP'
  uuid?: string
  iat: number
  exp: number
}
