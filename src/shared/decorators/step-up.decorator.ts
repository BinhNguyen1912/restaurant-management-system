import { STEP_UP_REQUIRED_KEY } from '@/shared/constants/auth.constant'
import { SetMetadata } from '@nestjs/common'

/**
 * Gắn lên route nhạy cảm: ngoài access token, request phải mang vé `x-step-up-token` còn hạn.
 *
 * "Nhạy cảm" ở đây là **không hoàn tác được hoặc leo thang được**: đổi quyền, tạo/sửa/xoá vai trò,
 * tạo/sửa/xoá tài khoản. Không gắn cho việc thường ngày (sửa giá, huỷ đơn, ghi chú khách): hỏi mật
 * khẩu ở mọi màn là cách nhanh nhất để người dùng gõ mật khẩu theo phản xạ mà không đọc hộp thoại —
 * lúc đó lớp bảo vệ chỉ còn là thao tác, còn chi phí thì thật.
 *
 * Việc gắn là **khai báo tại route**, không nằm trong bảng Permission: đây là điều kiện về *phiên*
 * chứ không phải về *vai trò*, và nó phải đọc được ngay trong file route.
 */
export const RequireStepUp = () => SetMetadata(STEP_UP_REQUIRED_KEY, true)
