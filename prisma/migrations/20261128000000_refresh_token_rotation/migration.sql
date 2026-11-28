-- Refresh token nhân viên: không lưu plaintext, xoay vòng mỗi lần refresh, thu hồi theo family.
--
-- Trước đây cột "token" giữ nguyên bearer token (plaintext) và không bao giờ rotate: dump DB,
-- backup hay log lộ ra là dùng được luôn. Đổi sang sha256 hex + family + usedAt/revokedAt.
--
-- Backfill chứ không xoá: token cũ vẫn đang nằm trong phiên của người dùng, hash lại là giữ được
-- phiên mà plaintext biến mất khỏi DB. Mỗi dòng cũ thành một family riêng vì không còn dấu vết
-- chuỗi cấp phát; md5(random()) thay cho gen_random_uuid() để không phụ thuộc phiên bản Postgres.
-- sha256(bytea) là hàm có sẵn từ Postgres 11, không cần extension pgcrypto.

ALTER TABLE "RefreshToken"
  ADD COLUMN "tokenHash" VARCHAR(64),
  ADD COLUMN "familyId" VARCHAR(36),
  ADD COLUMN "usedAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3);

UPDATE "RefreshToken"
SET
  "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex'),
  "familyId"  = md5(random()::text || clock_timestamp()::text);

ALTER TABLE "RefreshToken"
  ALTER COLUMN "tokenHash" SET NOT NULL,
  ALTER COLUMN "familyId" SET NOT NULL;

DROP INDEX "RefreshToken_token_key";

ALTER TABLE "RefreshToken" DROP COLUMN "token";

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
