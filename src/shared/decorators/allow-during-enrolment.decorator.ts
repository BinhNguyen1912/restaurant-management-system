import { ALLOW_DURING_ENROLMENT_KEY } from '@/shared/constants/auth.constant'
import { SetMetadata } from '@nestjs/common'

/**
 * Route vẫn gọi được khi phiên đang ở trạng thái "phải bật 2FA trước" — xem `TwoFactorEnrolmentGuard`.
 *
 * Chỉ đúng ba cửa được đánh dấu: `/auth/2fa/setup`, `/auth/2fa/enable` (đường thoát duy nhất) và
 * `/auth/logout` (để người dùng không bị kẹt trong một phiên không dùng được gì). Thêm route vào
 * đây là nới rào chắn, không phải tiện tay.
 */
export const AllowDuringEnrolment = () => SetMetadata(ALLOW_DURING_ENROLMENT_KEY, true)
