-- Đối soát theo kỳ (ticket #13): giữ lại từng lần chạy + từng sai lệch để xử lý tiếp.
CREATE TYPE "ReconciliationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "ReconciliationKind" AS ENUM ('MATCHED', 'MISSING_IN_LEDGER', 'AMOUNT_MISMATCH', 'DUPLICATE', 'STATUS_MISMATCH');
CREATE TYPE "ReconciliationItemStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');
CREATE TYPE "ReconciliationRefType" AS ENUM ('PAYMENT', 'VNPAY');

CREATE TABLE "ReconciliationRun" (
    "id" SERIAL NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "branchId" INTEGER,
    "status" "ReconciliationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "summary" JSONB,
    "error" VARCHAR(1000),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationItem" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "kind" "ReconciliationKind" NOT NULL,
    "refType" "ReconciliationRefType" NOT NULL,
    "refId" INTEGER NOT NULL,
    "paymentId" INTEGER,
    "ledgerEntryId" INTEGER,
    "transactionId" VARCHAR(128),
    "amountExpected" DECIMAL(14,2) NOT NULL,
    "amountActual" DECIMAL(14,2) NOT NULL,
    "amountDelta" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "ReconciliationItemStatus" NOT NULL DEFAULT 'OPEN',
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReconciliationItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReconciliationRun_branchId_periodFrom_idx" ON "ReconciliationRun"("branchId", "periodFrom");
CREATE INDEX "ReconciliationRun_status_startedAt_idx" ON "ReconciliationRun"("status", "startedAt");
CREATE INDEX "ReconciliationItem_runId_kind_idx" ON "ReconciliationItem"("runId", "kind");
CREATE INDEX "ReconciliationItem_paymentId_idx" ON "ReconciliationItem"("paymentId");

ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ReconciliationItem" ADD CONSTRAINT "ReconciliationItem_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
