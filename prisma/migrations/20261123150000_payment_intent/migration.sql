-- DropIndex
DROP INDEX "public"."Payment_transactionId_key";

-- CreateTable
CREATE TABLE "public"."PaymentIntent" (
    "id" SERIAL NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "reference" VARCHAR(128) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "orderIds" INTEGER[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_reference_key" ON "public"."PaymentIntent"("reference");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_createdAt_idx" ON "public"."PaymentIntent"("status", "createdAt");

