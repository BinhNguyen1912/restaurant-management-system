-- Nâng cấp sổ cái theo mẫu của trustwow-backend (module double-entry):
--   1. bút toán đi 2 bước DRAFT -> POSTED trong cùng transaction
--   2. requestHash để phát hiện "cùng eventKey nhưng nội dung khác" (không được ghi đè)
--   3. CHECK ở DB: bút toán POSTED phải có postedAt, tiền > 0, VND là số nguyên đồng
--
-- Bảng đang rỗng (chưa ghi bút toán nào) nên thêm cột NOT NULL an toàn.

CREATE TYPE "public"."LedgerEntryStatus" AS ENUM ('DRAFT', 'POSTED');

ALTER TABLE "public"."LedgerEntry"
  ADD COLUMN "status" "public"."LedgerEntryStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "postedAt" TIMESTAMP(3),
  ADD COLUMN "requestHash" CHAR(64) NOT NULL DEFAULT '';

ALTER TABLE "public"."LedgerEntry" ALTER COLUMN "requestHash" DROP DEFAULT;

-- POSTED thì phải có postedAt, DRAFT thì không
ALTER TABLE "public"."LedgerEntry" ADD CONSTRAINT "CK_LedgerEntry_posted_at"
  CHECK (("status" = 'DRAFT' AND "postedAt" IS NULL) OR ("status" = 'POSTED' AND "postedAt" IS NOT NULL));

ALTER TABLE "public"."LedgerEntry" ADD CONSTRAINT "CK_LedgerEntry_request_hash"
  CHECK ("requestHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "public"."LedgerEntry" ADD CONSTRAINT "CK_LedgerEntry_currency"
  CHECK ("currency" = 'VND');

-- Dòng bút toán: tiền dương, VND là số nguyên đồng (không có phần lẻ), chiều hợp lệ
ALTER TABLE "public"."LedgerLine" ADD CONSTRAINT "CK_LedgerLine_amount"
  CHECK ("amount" > 0 AND "amount" = round("amount"));

ALTER TABLE "public"."LedgerLine" ADD CONSTRAINT "CK_LedgerLine_direction"
  CHECK ("direction" IN ('DEBIT', 'CREDIT'));

ALTER TABLE "public"."LedgerLine" ADD CONSTRAINT "CK_LedgerLine_currency"
  CHECK ("currency" = 'VND');

CREATE INDEX "LedgerEntry_status_postedAt_idx" ON "public"."LedgerEntry"("status", "postedAt");
