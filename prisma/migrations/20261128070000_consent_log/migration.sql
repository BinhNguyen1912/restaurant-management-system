-- Nhật ký đồng ý xử lý dữ liệu cá nhân (NĐ 13/2023/NĐ-CP, Điều 9).
--
-- APPEND-ONLY: mỗi lần khách đồng ý hoặc rút đồng ý là MỘT dòng mới, "đang đồng ý" = dòng mới nhất
-- của (customerId, purpose). Trigger chỉ chặn UPDATE, KHÔNG chặn DELETE: DELETE chỉ xảy ra qua
-- CASCADE khi xoá hồ sơ khách — đó là quyền xoá dữ liệu của khách, còn *viết lại lịch sử* mới là
-- thứ làm mất giá trị bằng chứng.

CREATE TYPE "public"."ConsentPurpose" AS ENUM ('SERVICE', 'MARKETING');

ALTER TYPE "public"."AuditAction" ADD VALUE 'CONSENT_RECORDED';

ALTER TYPE "public"."AuditEntityType" ADD VALUE 'CUSTOMER';

CREATE TABLE "public"."ConsentLog" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "purpose" "public"."ConsentPurpose" NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "ip" VARCHAR(45),
    "note" VARCHAR(255),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsentLog_customerId_purpose_createdAt_idx" ON "public"."ConsentLog"("customerId", "purpose", "createdAt");

ALTER TABLE "public"."ConsentLog" ADD CONSTRAINT "ConsentLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ConsentLog" ADD CONSTRAINT "ConsentLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TRIGGER IF EXISTS "ConsentLog_no_update" ON "public"."ConsentLog";
CREATE TRIGGER "ConsentLog_no_update"
  BEFORE UPDATE ON "public"."ConsentLog"
  FOR EACH ROW EXECUTE FUNCTION "deny_append_only_mutation"();
