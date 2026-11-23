-- Migration: them Branch + branchId (bat buoc) + boc tach tien tren Order
-- Sua tay tu ban Prisma generate: Prisma khong tu backfill duoc cot NOT NULL tren bang co du lieu,
-- nen file nay lam 3 buoc: tao Branch + chi nhanh mac dinh -> them cot nullable -> backfill -> SET NOT NULL.

-- 1) Bang Branch
CREATE TABLE "public"."Branch" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Branch_code_key" ON "public"."Branch"("code");

-- 2) Chi nhanh mac dinh cho toan bo du lieu cu
INSERT INTO "public"."Branch" ("code", "name", "address", "timezone", "isActive", "createdAt", "updatedAt")
VALUES ('MAIN', 'Chi nhánh chính', '', 'Asia/Ho_Chi_Minh', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 3) Area: name chi unique trong 1 chi nhanh
DROP INDEX "public"."Area_name_key";

-- 4) Them cot nullable
ALTER TABLE "public"."Area"       ADD COLUMN "branchId" INTEGER;
ALTER TABLE "public"."Table"      ADD COLUMN "branchId" INTEGER;
ALTER TABLE "public"."TableNode"  ADD COLUMN "branchId" INTEGER;
ALTER TABLE "public"."Order"      ADD COLUMN "branchId" INTEGER;
ALTER TABLE "public"."Payment"    ADD COLUMN "branchId" INTEGER;
ALTER TABLE "public"."Reservation" ADD COLUMN "branchId" INTEGER;
ALTER TABLE "public"."User"       ADD COLUMN "branchId" INTEGER;

-- 5) Boc tach tien tren Order (tip khoan lam -> luon 0)
ALTER TABLE "public"."Order"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  ADD COLUMN "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "serviceChargeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "serviceChargeRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tipAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- 6) Backfill branchId = chi nhanh mac dinh
UPDATE "public"."Area"        SET "branchId" = (SELECT "id" FROM "public"."Branch" WHERE "code" = 'MAIN');
UPDATE "public"."Table"       SET "branchId" = (SELECT "id" FROM "public"."Branch" WHERE "code" = 'MAIN');
UPDATE "public"."TableNode"   SET "branchId" = (SELECT "id" FROM "public"."Branch" WHERE "code" = 'MAIN');
UPDATE "public"."Order"       SET "branchId" = (SELECT "id" FROM "public"."Branch" WHERE "code" = 'MAIN');
UPDATE "public"."Payment"     SET "branchId" = (SELECT "id" FROM "public"."Branch" WHERE "code" = 'MAIN');
UPDATE "public"."Reservation" SET "branchId" = (SELECT "id" FROM "public"."Branch" WHERE "code" = 'MAIN');

-- 7) Backfill tien cho don cu: chua co giam gia/phi phuc vu, tong = so tien da thanh toan
UPDATE "public"."Order" o
SET "subtotal"   = p."amount",
    "grandTotal" = p."amount"
FROM "public"."Payment" p
WHERE p."id" = o."paymentId";

-- 8) Bat buoc NOT NULL sau khi da backfill
ALTER TABLE "public"."Area"        ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "public"."Table"       ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "public"."TableNode"   ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "public"."Order"       ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "public"."Payment"     ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "public"."Reservation" ALTER COLUMN "branchId" SET NOT NULL;

-- 9) Index + rang buoc
CREATE UNIQUE INDEX "Area_branchId_name_key" ON "public"."Area"("branchId", "name");
CREATE INDEX "Order_branchId_createdAt_idx" ON "public"."Order"("branchId", "createdAt");
CREATE INDEX "Order_deletedAt_status_createdAt_idx" ON "public"."Order"("deletedAt", "status", "createdAt");

ALTER TABLE "public"."User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."Table" ADD CONSTRAINT "Table_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."Area" ADD CONSTRAINT "Area_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."TableNode" ADD CONSTRAINT "TableNode_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
