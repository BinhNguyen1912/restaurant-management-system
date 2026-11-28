-- Lần thu tiền thứ hai (phần còn lại sau cọc) phải trỏ về đơn của nó.
--
-- Trước đây mỗi đơn chỉ có đúng một Payment (`Order.paymentId`), và Payment đó đang giữ tiền cọc
-- đã thu (status SUCCESS). Khách trả nốt bằng tiền mặt thì không còn chỗ nào ghi khoản thu thứ hai:
-- ghi đè Payment cũ là mất dấu khoản cọc, tạo Payment mới mà không có cột nối thì không biết thu cho
-- đơn nào. Thêm `orderId` nullable: cọc giữ nguyên, lần thu sau là một dòng Payment riêng.
--
-- Backfill chỉ chạy khi liên kết RÕ RÀNG (đúng 1 đơn trỏ vào Payment đó) — đơn đã chia/merge thì
-- để NULL thay vì đoán bừa.

ALTER TABLE "Payment" ADD COLUMN "orderId" INTEGER;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

UPDATE "Payment" p
SET "orderId" = o."id"
FROM "Order" o
WHERE o."paymentId" = p."id"
  AND p."orderId" IS NULL
  AND (SELECT COUNT(*) FROM "Order" o2 WHERE o2."paymentId" = p."id") = 1;
