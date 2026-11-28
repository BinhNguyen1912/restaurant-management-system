-- OTP: lưu sha256(code) thay vì plaintext, đếm lượt nhập sai, đánh dấu đã dùng (prod-readiness M1).
--
-- Vì sao đổi cả khoá tra cứu: trước đây mã được tra bằng `findUnique({ email, code, type })` nên
-- không có chỗ nào đếm "mã này đã bị nhập sai bao nhiêu lần". Bỏ cột plaintext thì phải tra theo
-- `(email, type)` lấy mã đang sống, rồi so hash — nhờ vậy mới gắn được bộ đếm vào đúng dòng mã.
--
-- `sha256(bytea)` có sẵn từ Postgres 11 (đã dùng ở migration refresh token), không cần pgcrypto.
-- Backfill để mã đang bay giữa lúc deploy vẫn dùng được tới khi hết hạn (5 phút).

ALTER TABLE "VerificationCode" ADD COLUMN "codeHash" VARCHAR(64);
UPDATE "VerificationCode" SET "codeHash" = encode(sha256(convert_to("code", 'UTF8')), 'hex');
ALTER TABLE "VerificationCode" ALTER COLUMN "codeHash" SET NOT NULL;

ALTER TABLE "VerificationCode" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "VerificationCode" ADD COLUMN "consumedAt" TIMESTAMP(3);

DROP INDEX "VerificationCode_email_code_type_key";
ALTER TABLE "VerificationCode" DROP COLUMN "code";

CREATE INDEX "VerificationCode_email_type_createdAt_idx" ON "VerificationCode"("email", "type", "createdAt");
