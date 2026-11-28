import { hkdfSync } from 'node:crypto'

/**
 * Dẫn xuất khoá theo MỤC ĐÍCH từ một secret đã có (HKDF-SHA256).
 *
 * Vì sao không dùng thẳng secret: một secret dùng cho hai việc khác nhau (ký JWT, mã hoá bí mật
 * TOTP, ký vé nhập-lại-mật-khẩu) nghĩa là lộ một chỗ là lộ cả hai. `salt` + `info` chính là phân
 * vùng mục đích: cùng một `material` nhưng khác `info` cho ra hai khoá không suy ra được nhau, nên
 * một khoá bị lộ không kéo theo khoá kia.
 *
 * Mặt trái phải biết: đổi `material` (xoay `ACCESS_TOKEN_SECRET`) là **mọi** khoá dẫn xuất từ nó
 * đổi theo. Chỗ nào đang lưu bản mã hoá bằng khoá cũ thì hỏng — cụ thể là bí mật TOTP: người dùng
 * phải setup lại 2FA. Ghi ở docs/prod-readiness-plan.md §M9.
 */
export function deriveKey(input: { material: string; salt: string; info: string; length?: number }): Buffer {
  const { material, salt, info, length = 32 } = input
  return Buffer.from(hkdfSync('sha256', material, salt, info, length))
}
