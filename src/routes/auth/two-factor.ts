import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import * as OTPAuth from 'otpauth'
import { deriveKey } from '@/shared/service/key-derivation'

/**
 * 2FA bằng ứng dụng xác thực (TOTP) — phần thuần, không chạm DB, không đọc config.
 *
 * Ba thứ nằm ở đây vì chúng quyết định đúng/sai của cả cơ chế và đều test được không cần Postgres:
 * sinh bí mật, kiểm mã, và mã hoá bí mật khi lưu.
 *
 * Vì sao phải mã hoá: cột `User.totpSecret` giữ khoá sinh mã của tài khoản. Để nguyên base32 là ai
 * đọc được DB (backup, log, một buổi `SELECT` của dev, một bản dump lọt ra ngoài) cũng sinh được mã
 * hợp lệ của mọi tài khoản — 2FA còn lại đúng một lớp hình thức.
 */

/** Số chữ số của mã; FE và ứng dụng xác thực đều phải khớp giá trị này */
export const TOTP_DIGITS = 6

/** Chu kỳ đổi mã, tính bằng giây */
export const TOTP_PERIOD_SECONDS = 30

/**
 * Số chu kỳ lệch được chấp nhận: 1 nghĩa là nhận cả mã của 30 giây trước và 30 giây sau.
 *
 * Không phải "nới cho dễ": đồng hồ điện thoại lệch vài giây là chuyện thường, mà chặn đúng biên thì
 * người dùng gõ mã vừa đổi và bị từ chối vô cớ. Đổi lại cửa sổ dò rộng thành ~90 giây mỗi mã —
 * vẫn vô nghĩa với 10^6 khả năng khi đã có bộ đếm sai + khoá tài khoản.
 */
export const TOTP_WINDOW = 1

/** Tên hiện trong ứng dụng xác thực (Google Authenticator, 1Password, ...) */
export const TOTP_ISSUER = 'ResManager'

/**
 * Tiền tố định dạng giá trị đã mã hoá. Đổi thuật toán/khoá thì tăng số này và xử lý được cả hai
 * định dạng trong lúc chuyển — không có số phiên bản thì lần đổi khoá sau là mất hết bí mật.
 */
const SECRET_FORMAT = 'v1'

/** Sinh bí mật TOTP mới, dạng base32 (thứ ứng dụng xác thực nhận). 20 byte = 160 bit, mức khuyến nghị của RFC 4226. */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32
}

/** URI `otpauth://` để FE vẽ QR; cũng là thứ người dùng gõ tay nếu không quét được */
export function buildTotpUri(email: string, secret: string): string {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).toString()
}

/**
 * Kiểm một mã TOTP.
 *
 * Trả `false` (không ném) với mọi đầu vào không dùng được — mã sai định dạng, bí mật hỏng trong DB.
 * Lý do: hàm này nằm trên đường đăng nhập, ném ra ở đây là biến một dòng dữ liệu hỏng thành 500 cho
 * mọi lần đăng nhập của tài khoản đó, và 500 thì không nói được cho người dùng biết phải làm gì.
 */
export function verifyTotpCode(secret: string, code: string, timestamp: number = Date.now()): boolean {
  // Kiểm chữ số bằng so sánh ký tự, không bằng regex: một dấu `\` bị mất trong chuỗi là regex
  // thành `^d{6}$` và mọi mã đều bị từ chối — hỏng theo hướng im lặng, test nào chỉ thử mã sai cũng
  // không thấy gì.
  if (code.length !== TOTP_DIGITS || [...code].some((digit) => digit < '0' || digit > '9')) return false
  try {
    const totp = new OTPAuth.TOTP({
      issuer: TOTP_ISSUER,
      algorithm: 'SHA1',
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      secret: OTPAuth.Secret.fromBase32(secret),
    })
    return totp.validate({ token: code, timestamp, window: TOTP_WINDOW }) !== null
  } catch {
    return false
  }
}

/**
 * Khoá mã hoá bí mật TOTP, dẫn xuất từ `material` bằng HKDF-SHA256.
 *
 * Dẫn xuất chứ không dùng thẳng: `material` là khoá ký JWT (hoặc biến riêng nếu có), dùng nguyên
 * byte làm khoá AES là dùng một khoá cho hai việc khác nhau. HKDF tách miền bằng `info` nên khoá
 * AES không bao giờ trùng byte với khoá ký, và đổi `info` là đổi khoá.
 *
 * Hệ quả phải biết: **đổi `material` là mọi bí mật TOTP đã lưu không giải mã được nữa** — người
 * dùng phải setup lại. Ghi ở docs/prod-readiness-plan.md.
 */
export function deriveTotpKey(material: string): Buffer {
  return deriveKey({ material, salt: 'res-mana-2fa', info: 'totp-secret-v1' })
}

/** Mã hoá bí mật TOTP để lưu DB. AES-256-GCM: có xác thực, sửa một byte là giải mã hỏng. */
export function encryptTotpSecret(plainSecret: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()])
  return [
    SECRET_FORMAT,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

/**
 * Giải mã bí mật đã lưu. Trả `null` khi giá trị không dùng được: sai định dạng, sai phiên bản,
 * hoặc khoá đã đổi (GCM báo lỗi xác thực).
 *
 * `null` chứ không ném: nơi gọi phải phân biệt được "bí mật hỏng" với "mã người dùng nhập sai", và
 * cả hai đều dẫn tới câu trả lời an toàn là không cho qua.
 */
export function decryptTotpSecret(stored: string | null | undefined, key: Buffer): string | null {
  if (!stored) return null
  const parts = stored.split(':')
  if (parts.length !== 4 || parts[0] !== SECRET_FORMAT) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'))
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Yếu tố thứ hai mà request đang trình ra */
export type SecondFactorKind = 'TOTP' | 'EMAIL' | 'NONE'

/**
 * Request đang trình mã nào.
 *
 * Có cả hai thì chọn TOTP và **không** thử tiếp phương án còn lại khi TOTP sai: thử lần lượt là cho
 * kẻ dò hai cửa sổ dò trong cùng một lượt đăng nhập, mà bộ đếm sai chỉ nhích một lần.
 */
export function secondFactorKind(input: { totpCode?: string | null; emailCode?: string | null }): SecondFactorKind {
  if (input.totpCode) return 'TOTP'
  if (input.emailCode) return 'EMAIL'
  return 'NONE'
}
