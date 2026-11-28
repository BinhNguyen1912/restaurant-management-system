import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class SharedRefreshTokenRepo {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Thu hồi toàn bộ refresh token còn sống của một user (logout, xoá user).
   *
   * Đánh dấu `revokedAt` thay vì xoá dòng: token bị thu hồi vẫn được nhận ra khi có người dùng
   * lại, nhờ vậy phân biệt được "token cũ bị replay" với "token chưa từng tồn tại".
   */
  revokeUserRefreshTokens(userId: number) {
    return this.prismaService.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  /**
   * Dọn bảng refresh token.
   *
   * - Quá hạn: JWT đã hết hạn nên không thể đổi được nữa.
   * - Đã bị thu hồi: family đã chết, giữ lại cũng không cấp được token mới.
   *
   * Token chỉ "đã dùng" (chưa thu hồi) mà còn hạn thì **giữ lại**: nó là bẫy phát hiện dùng lại
   * token cũ — xoá sớm thì một vụ replay sẽ chỉ trả 401 "không tìm thấy" thay vì revoke family.
   * Dòng đã thu hồi không còn giá trị đó (family đã bị cắt rồi) nên dọn sớm là an toàn.
   */
  deleteRefreshTokens() {
    const now = new Date()
    return this.prismaService.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
      },
    })
  }
}
