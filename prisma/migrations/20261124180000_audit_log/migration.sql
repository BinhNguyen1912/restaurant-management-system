-- Nhật ký thao tác nhạy cảm (ticket #10). Append-only: chỉ INSERT (qua service) và SELECT (qua API).
CREATE TYPE "AuditAction" AS ENUM ('ORDER_CANCELLED', 'ORDER_DISCOUNT_CHANGED', 'ORDER_PRICE_CHANGED', 'PRODUCT_PRICE_CHANGED', 'PAYMENT_REFUNDED');
CREATE TYPE "AuditEntityType" AS ENUM ('ORDER', 'PRODUCT', 'SKU', 'PAYMENT');

CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER,
    "actorRole" VARCHAR(50),
    "action" "AuditAction" NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" INTEGER NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" VARCHAR(500),
    "branchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_branchId_createdAt_idx" ON "AuditLog"("branchId", "createdAt");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
