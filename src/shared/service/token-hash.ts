import { createHash } from 'node:crypto'

/**
 * sha256 hex (64 ký tự) của refresh token nhân viên.
 *
 * DB chỉ giữ hash: rò rỉ bảng `RefreshToken` (dump, backup, log) không còn là rò rỉ
 * bearer token dùng được. Hàm thuần, không phụ thuộc DB, nên test được riêng.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
