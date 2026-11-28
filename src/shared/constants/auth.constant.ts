export const REQUEST_USER_KEY = 'user'

export const AuthType = {
  Bearer: 'Bearer',
  PaymentApiKey: 'PaymentApiKey',
  None: 'None',
} as const

export const ConditionGuard = {
  And: 'and',
  Or: 'or',
} as const
export const TypeOfVerification = {
  REGISTER: 'REGISTER',
  FORGOT_PASSWORD: 'FORGOT_PASSWORD',
  LOGIN: 'LOGIN',
  DISABLE_2FA: 'DISABLE_2FA',
} as const
export type TypeOfVerificationType = (typeof TypeOfVerification)[keyof typeof TypeOfVerification]
export type AuthTypeType = (typeof AuthType)[keyof typeof AuthType]
export type ConditionGuardType = (typeof ConditionGuard)[keyof typeof ConditionGuard]

/**
 * Nhập lại mật khẩu trước thao tác nhạy cảm (step-up).
 *
 * Header `x-step-up-token` mang VÉ, không mang mật khẩu: gửi mật khẩu kèm từng request là để nó
 * nằm trong log proxy/browser history ở mọi thao tác, và không có cách nào hết hạn nó sau một lần
 * gõ. Vé sống ngắn, gắn với một `userId`, và không dùng được như access token.
 */
export const STEP_UP_TOKEN_HEADER = 'x-step-up-token'
export const STEP_UP_REQUIRED_KEY = 'StepUpRequired'
/**
 * Vé sống bao lâu: đủ để mở hộp thoại, gõ mật khẩu rồi bấm Lưu; không đủ để thành một phiên thứ hai
 * (một phiên thứ hai bỏ qua được cả 2FA lẫn thời hạn của access token). Không đọc từ env: đây là
 * tham số bảo mật, đổi được bằng biến môi trường nghĩa là một lần cấu hình sai là tắt tác dụng.
 */
export const STEP_UP_TOKEN_TTL_MINUTES = 5
