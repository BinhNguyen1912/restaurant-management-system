-- Nhập hàng: mỗi lần hàng về là MỘT dòng, kèm ảnh bằng chứng, giá nhập và người nhận.
-- Lý do: trước đây tồn kho chỉ sửa tay bằng số tuyệt đối (stock = 15) nên gõ nhầm là mất tồn,
-- và không có bằng chứng/lịch sử để đối chiếu với nhà cung cấp.
CREATE TABLE "StockReceipt" (
    "id" SERIAL NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "supplier" VARCHAR(255),
    "note" VARCHAR(500),
    "images" TEXT[],
    "stockAfter" DOUBLE PRECISION NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockReceipt_ingredientId_receivedAt_idx" ON "StockReceipt"("ingredientId", "receivedAt");

ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Nhật ký: có nhập hàng là có vết (ai nhập, bao nhiêu, ảnh nào)
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STOCK_RECEIVED';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'INGREDIENT';
