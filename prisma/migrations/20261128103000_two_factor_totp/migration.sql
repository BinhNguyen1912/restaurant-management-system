-- 2FA bằng ứng dụng xác thực (TOTP) — prod-readiness §M9 mục 5.
--
-- Cột totpSecret có từ trước nhưng chưa từng được ghi. Từ đây nó giữ bản MÃ HOÁ AES-256-GCM
-- chứ không phải base32 thô (xem src/routes/auth/two-factor.ts), nên không có dữ liệu cũ phải chuyển đổi.
--
-- twoFactorEnabled tách khỏi "đã có bí mật": bí mật được ghi ở bước setup, còn bật chỉ sau khi người
-- dùng nhập được một mã thật. Gộp hai việc làm một thì gõ sai ở bước setup là tự khoá mình ra ngoài.

ALTER TABLE "public"."User"
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);

ALTER TYPE "public"."AuditAction" ADD VALUE 'TWO_FACTOR_ENABLED';

ALTER TYPE "public"."AuditAction" ADD VALUE 'TWO_FACTOR_DISABLED';
