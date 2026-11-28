/**
 * Vai trò nào BẮT BUỘC bật 2FA (prod-readiness §M9 mục 5).
 *
 * So theo TÊN vai trò, không theo `roleId`: `roleId` khác nhau giữa các môi trường (dựng lại DB là
 * id đổi), còn tên vai trò là thứ con người đọc trong `create-permissions.ts`. Hệ thống cho tạo vai
 * trò mới, nên đây là danh sách chứ không phải "mọi vai trò không phải GUEST/USER" — một vai trò
 * mới tạo ra không tự nhiên thành vai trò bắt buộc 2FA.
 */
export const TWO_FACTOR_REQUIRED_ROLES = ['ADMIN', 'KE_TOAN'] as const

export type TwoFactorEnforcement = 'off' | 'on'

export function roleRequiresTwoFactor(roleName: string | null | undefined): boolean {
  if (!roleName) return false
  return (TWO_FACTOR_REQUIRED_ROLES as readonly string[]).includes(roleName)
}

/**
 * Phiên này có đang ở trạng thái "phải bật 2FA trước khi làm gì khác"?
 *
 * Hàm thuần, `enforcement` truyền vào chứ không đọc env: cùng đầu vào cho cùng kết quả, và biến môi
 * trường chỉ được đọc ở đúng một chỗ cấp token (xem `AuthService`). Nhờ vậy test được cả hai trạng
 * thái mà không phải khởi động lại app.
 *
 * Cố ý KHÔNG trả `true` khi enforcement tắt: bật bắt buộc là quyết định rollout của người vận hành
 * (FE chưa có màn hình enrolment), nên mặc định không chặn ai.
 */
export function needsTwoFactorEnrolment(input: {
  roleName: string | null | undefined
  /** DB là non-null; `undefined` chỉ xảy ra khi chỗ đọc dùng `select` — coi như CHƯA bật (fail closed) */
  twoFactorEnabled: boolean | null | undefined
  enforcement: TwoFactorEnforcement
}): boolean {
  if (input.enforcement !== 'on') return false
  if (input.twoFactorEnabled) return false
  return roleRequiresTwoFactor(input.roleName)
}
