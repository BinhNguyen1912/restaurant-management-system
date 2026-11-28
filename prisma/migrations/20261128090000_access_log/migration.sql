-- Nhật ký TRUY CẬP dữ liệu cá nhân (NĐ 13/2023/NĐ-CP, Điều 26).
--
-- Bảng này trả lời câu hỏi "ai đã đọc hồ sơ của khách nào, lúc nào" — câu hỏi mà AuditLog không
-- trả lời được vì AuditLog chỉ ghi các thao tác GHI. Ở đây đọc cũng là hành vi phải giải trình.
--
-- APPEND-ONLY: trigger chỉ chặn UPDATE (viết lại lịch sử mới là thứ phá bằng chứng). DELETE không
-- bị chặn để còn dọn theo thời hạn lưu — bảng này chứa IP của nhân viên, cũng là dữ liệu cá nhân.
--
-- KHÔNG có khoá ngoại tới Customer: xoá hồ sơ khách không được làm biến mất bằng chứng đã có
-- người đọc hồ sơ đó. `customerId` còn lại chỉ là một con số.

ALTER TYPE "public"."AuditAction" ADD VALUE 'CUSTOMER_NOTE_UPDATED';

CREATE TABLE "public"."AccessLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER,
    "actorRole" VARCHAR(50),
    "route" VARCHAR(120) NOT NULL,
    "customerId" INTEGER,
    "resultCount" INTEGER,
    "ip" VARCHAR(45),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccessLog_customerId_createdAt_idx" ON "public"."AccessLog"("customerId", "createdAt");

CREATE INDEX "AccessLog_actorId_createdAt_idx" ON "public"."AccessLog"("actorId", "createdAt");

CREATE INDEX "AccessLog_route_createdAt_idx" ON "public"."AccessLog"("route", "createdAt");

DROP TRIGGER IF EXISTS "AccessLog_no_update" ON "public"."AccessLog";
CREATE TRIGGER "AccessLog_no_update"
  BEFORE UPDATE ON "public"."AccessLog"
  FOR EACH ROW EXECUTE FUNCTION "deny_append_only_mutation"();
