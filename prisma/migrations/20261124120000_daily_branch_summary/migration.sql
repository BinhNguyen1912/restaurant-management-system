-- Projection doanh thu theo (ngày, chi nhánh, tiền tệ) — đọc từ sổ cái, tính lại được (ADR 0001 D8).
CREATE TABLE "DailyBranchSummary" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "branchId" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "gross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "serviceCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tip" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashIn" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vnpayIn" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refund" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyBranchSummary_pkey" PRIMARY KEY ("id")
);

-- một dòng / (ngày, chi nhánh, tiền tệ): job recompute upsert vào đây
CREATE UNIQUE INDEX "DailyBranchSummary_date_branchId_currency_key" ON "DailyBranchSummary"("date", "branchId", "currency");
CREATE INDEX "DailyBranchSummary_branchId_date_idx" ON "DailyBranchSummary"("branchId", "date");

ALTER TABLE "DailyBranchSummary" ADD CONSTRAINT "DailyBranchSummary_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
