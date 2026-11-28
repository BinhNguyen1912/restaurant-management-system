-- Nhật ký truy cập: `customerId` → cặp (subjectType, subjectId).
--
-- Bảng vừa sinh một ngày và mới chỉ có module khách ghi vào, nên đổi hình dạng BÂY GIỜ rẻ hơn nhiều
-- so với thêm một cột cho mỗi module về sau (nhân viên, đặt bàn, ...) và mọi câu truy vấn phải biết
-- đang hỏi bảng nào. Dòng cũ toàn bộ là CUSTOMER nên backfill được, không mất bằng chứng nào.
--
-- Trigger append-only phải TẮT trong đúng một câu backfill dưới đây: nó tồn tại để chặn ứng dụng
-- viết lại lịch sử, còn đây là migration đổi hình dạng và giữ nguyên nghĩa của dòng (một cột
-- `customerId` thành cặp `CUSTOMER` + id). Bật lại ngay sau đó, trong cùng transaction.

CREATE TYPE "public"."AccessSubject" AS ENUM ('CUSTOMER', 'USER');

ALTER TABLE "public"."AccessLog" ADD COLUMN "subjectType" "public"."AccessSubject";
ALTER TABLE "public"."AccessLog" ADD COLUMN "subjectId" INTEGER;

ALTER TABLE "public"."AccessLog" DISABLE TRIGGER "AccessLog_no_update";
UPDATE "public"."AccessLog" SET "subjectType" = 'CUSTOMER', "subjectId" = "customerId" WHERE "customerId" IS NOT NULL;
ALTER TABLE "public"."AccessLog" ENABLE TRIGGER "AccessLog_no_update";

-- Xoá cột là xoá luôn index "AccessLog_customerId_createdAt_idx" của nó.
ALTER TABLE "public"."AccessLog" DROP COLUMN "customerId";

CREATE INDEX "AccessLog_subjectType_subjectId_createdAt_idx" ON "public"."AccessLog"("subjectType", "subjectId", "createdAt");

-- Không cho nửa cặp: có type mà thiếu id (hoặc ngược lại) là dòng nhật ký vô nghĩa — chặn ở DB,
-- đừng tin vào việc code nhớ set đủ hai cột.
ALTER TABLE "public"."AccessLog"
  ADD CONSTRAINT "AccessLog_subject_pair_check" CHECK (("subjectType" IS NULL) = ("subjectId" IS NULL));
