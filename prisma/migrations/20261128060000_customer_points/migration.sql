-- Điểm thưởng (CRM): đổi điểm thành giảm giá trên hoá đơn.
--
-- Vì sao bảng điểm KHÔNG giữ "số dư": số dư là hàm của hai thứ đã có trong DB —
--   tích luỹ = Σ floor(Order.grandTotal / 20.000) của các đơn PAID của khách
--   đã dùng  = Σ PointRedemption.points (chưa bị void)
-- Lưu thêm `Customer.point` là mở đường cho hai con số lệch nhau: hoàn tiền một đơn mà quên trừ
-- điểm, hay sửa tay một chỗ. Tích luỹ tính lại thì đơn bị huỷ/hoàn tự mất điểm, không cần hook.
--
-- Chỉ nửa "đã dùng" phải LƯU, vì nó là một hành động đã xảy ra (không suy ra được từ dữ liệu khác).

CREATE TABLE "PointRedemption" (
  "id" SERIAL NOT NULL,
  "customerId" INTEGER NOT NULL,
  "points" INTEGER NOT NULL,
  "valueVnd" DECIMAL(14,2) NOT NULL,
  "orderId" INTEGER,
  "voidedAt" TIMESTAMP(3),
  "reason" VARCHAR(255),
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PointRedemption_pkey" PRIMARY KEY ("id")
);

-- lịch sử điểm của một khách, mới nhất trước
CREATE INDEX "PointRedemption_customerId_createdAt_idx" ON "PointRedemption" ("customerId", "createdAt");
CREATE INDEX "PointRedemption_orderId_idx" ON "PointRedemption" ("orderId");
-- truy vấn số dư chỉ đọc các dòng còn hiệu lực
CREATE INDEX "PointRedemption_voidedAt_idx" ON "PointRedemption" ("voidedAt");

ALTER TABLE "PointRedemption"
  ADD CONSTRAINT "PointRedemption_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PointRedemption"
  ADD CONSTRAINT "PointRedemption_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PointRedemption"
  ADD CONSTRAINT "PointRedemption_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- nhật ký thao tác: trừ điểm là thao tác động vào tiền của khách nên phải giải trình được
ALTER TYPE "AuditAction" ADD VALUE 'POINTS_REDEEMED';

-- Dọn schema chết: `PointLog` (gắn `userId`, chưa từng có dòng code nào ghi/đọc, 0 dòng dữ liệu)
-- và `User.point`. Giữ lại chỉ làm người đọc tưởng hệ thống đã có tích điểm.
DROP TABLE "PointLog";
ALTER TABLE "User" DROP COLUMN "point";
