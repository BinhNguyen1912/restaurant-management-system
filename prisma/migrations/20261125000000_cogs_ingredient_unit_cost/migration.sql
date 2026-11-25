-- Ticket #11: COGS (giá vốn hàng bán) từ recipe.
-- Nguồn giá vốn là GIÁ NHẬP của nguyên liệu, KHÔNG phải tồn kho Redis (đang có bug trừ một phần).
ALTER TABLE "Ingredient" ADD COLUMN "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Bút toán giá vốn theo từng đơn đã thu tiền
ALTER TYPE "LedgerRefType" ADD VALUE IF NOT EXISTS 'ORDER_COGS';
