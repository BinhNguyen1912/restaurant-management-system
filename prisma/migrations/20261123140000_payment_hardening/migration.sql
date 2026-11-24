-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CASH', 'VNPAY', 'CARD', 'TRANSFER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."PaymentStatus" ADD VALUE 'REFUNDED';
ALTER TYPE "public"."PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
ADD COLUMN     "gatewayCode" VARCHAR(32),
ADD COLUMN     "gatewayPayload" JSONB,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2),
DROP COLUMN "method",
ADD COLUMN     "method" "public"."PaymentMethod";

-- CreateTable
CREATE TABLE "public"."WebhookEvent" (
    "id" SERIAL NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "externalId" VARCHAR(128) NOT NULL,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "public"."WebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "public"."WebhookEvent"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "public"."Payment"("transactionId");

