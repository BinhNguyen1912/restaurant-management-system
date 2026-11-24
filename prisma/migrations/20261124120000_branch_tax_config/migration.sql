-- Cấu hình thuế / phí phục vụ theo chi nhánh + snapshot thuế suất trên đơn
ALTER TABLE "Branch"
  ADD COLUMN IF NOT EXISTS "taxRate"           DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "serviceChargeRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pricesIncludeTax"  BOOLEAN      NOT NULL DEFAULT true;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
