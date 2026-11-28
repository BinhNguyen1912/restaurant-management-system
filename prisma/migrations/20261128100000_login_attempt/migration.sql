-- Nhật ký THỬ ĐĂNG NHẬP (NĐ 13/2023/NĐ-CP Điều 26 + kiểm soát nội bộ).
--
-- Lý do tồn tại: `AuditLog`/`LOGIN_LOCKED` chỉ ghi sau khi tài khoản đã bị khoá, nên giai đoạn dò
-- (4 lần sai đầu, hoặc dò vào email không tồn tại) hoàn toàn vô hình. Không thấy dò thì chỉ biết
-- chuyện đã xảy ra sau khi mất tài khoản.
--
-- Cố ý KHÔNG lưu email thô: bảng append-only, chép email vào là nhân bản dữ liệu cá nhân sang một
-- nơi không xoá được. Chỉ giữ sha256(email chuẩn hoá) — đủ để tương quan, KHÔNG phải ẩn danh.
--
-- APPEND-ONLY: trigger chặn UPDATE. DELETE để trống cho job dọn theo thời hạn lưu (bảng chứa IP).

CREATE TYPE "public"."LoginOutcome" AS ENUM ('SUCCESS', 'FAILED');

CREATE TABLE "public"."LoginAttempt" (
    "id" SERIAL NOT NULL,
    "emailHash" CHAR(64) NOT NULL,
    "actorId" INTEGER,
    "outcome" "public"."LoginOutcome" NOT NULL,
    "ip" VARCHAR(45),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginAttempt_emailHash_createdAt_idx" ON "public"."LoginAttempt"("emailHash", "createdAt");

CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "public"."LoginAttempt"("ip", "createdAt");

CREATE INDEX "LoginAttempt_createdAt_idx" ON "public"."LoginAttempt"("createdAt");

DROP TRIGGER IF EXISTS "LoginAttempt_no_update" ON "public"."LoginAttempt";
CREATE TRIGGER "LoginAttempt_no_update"
  BEFORE UPDATE ON "public"."LoginAttempt"
  FOR EACH ROW EXECUTE FUNCTION "deny_append_only_mutation"();
