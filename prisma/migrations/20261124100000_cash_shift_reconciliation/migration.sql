-- Ca làm việc + két tiền mặt (ticket P2-1, ADR 0001 D7)
-- Nguồn đối chiếu thứ hai cho tài khoản CASH: số đếm thực tế cuối ca vs số sổ cái.

-- 1) Loại bút toán mới: chênh lệch két khi đóng ca (thiếu/thừa)
ALTER TYPE "LedgerRefType" ADD VALUE IF NOT EXISTS 'CASH_VARIANCE';

-- 2) Trạng thái ca + loại thu/chi tiền mặt
DO $$ BEGIN
  CREATE TYPE "CashShiftStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CashMovementType" AS ENUM ('IN', 'OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Bảng ca làm việc
CREATE TABLE IF NOT EXISTS "CashShift" (
  "id"            SERIAL PRIMARY KEY,
  "branchId"      INTEGER NOT NULL,
  "staffId"       INTEGER NOT NULL,
  "status"        "CashShiftStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt"      TIMESTAMP(3),
  "openingFloat"  DECIMAL(14,2) NOT NULL,
  "countedCash"   DECIMAL(14,2),
  "expectedCash"  DECIMAL(14,2),
  "variance"      DECIMAL(14,2),
  "cashIn"        DECIMAL(14,2) NOT NULL DEFAULT 0,
  "cashOut"       DECIMAL(14,2) NOT NULL DEFAULT 0,
  "note"          VARCHAR(500),
  "closedById"    INTEGER,
  "ledgerEntryId" INTEGER,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "CashShift_staffId_fkey"  FOREIGN KEY ("staffId")  REFERENCES "User"("id")   ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "CashShift_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "CashShift_branchId_status_idx" ON "CashShift"("branchId", "status");
CREATE INDEX IF NOT EXISTS "CashShift_branchId_openedAt_idx" ON "CashShift"("branchId", "openedAt");
CREATE INDEX IF NOT EXISTS "CashShift_staffId_idx" ON "CashShift"("staffId");

-- Mỗi chi nhánh chỉ 1 ca đang mở; mỗi người chỉ 1 ca đang mở (chặn cả khi 2 request song song)
CREATE UNIQUE INDEX IF NOT EXISTS "CashShift_one_open_per_branch" ON "CashShift"("branchId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX IF NOT EXISTS "CashShift_one_open_per_staff" ON "CashShift"("staffId") WHERE "status" = 'OPEN';

-- 4) Bảng thu/chi tiền mặt trong ca
CREATE TABLE IF NOT EXISTS "CashMovement" (
  "id"          SERIAL PRIMARY KEY,
  "shiftId"     INTEGER NOT NULL,
  "type"        "CashMovementType" NOT NULL,
  "reason"      VARCHAR(255) NOT NULL,
  "amount"      DECIMAL(14,2) NOT NULL,
  "branchId"    INTEGER NOT NULL,
  "createdById" INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "CashMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "CashMovement_shiftId_idx" ON "CashMovement"("shiftId");

-- 5) Vá drift có sẵn: DB đang có index tên ..._isSystem_code_idx trong khi migration 190000 tạo ..._isSystem_idx
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'LedgerAccount_isSystem_code_idx')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'LedgerAccount_isSystem_idx') THEN
    ALTER INDEX "LedgerAccount_isSystem_code_idx" RENAME TO "LedgerAccount_isSystem_idx";
  END IF;
END $$;
