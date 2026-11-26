-- Thu/chi tiền mặt TAY trong ca phải vào sổ cái.
-- Trước đây `POST /cash-shifts/:id/movements` chỉ ghi bảng CashMovement: tiền vào/ra két KHÔNG
-- xuất hiện ở Sổ quỹ / Sổ cái / Báo cáo, nên sổ quỹ không phản ánh tiền mặt thực tế.
ALTER TYPE "LedgerRefType" ADD VALUE IF NOT EXISTS 'CASH_MOVEMENT';

-- Hai tài khoản đối ứng cho thu/chi tay (không phải doanh thu bán hàng)
INSERT INTO "LedgerAccount" ("code", "name", "type", "isCash", "isSystem", "isActive", "currency", "createdAt", "updatedAt")
VALUES
  ('OTHER_INCOME', 'Thu nhập khác bằng tiền mặt', 'REVENUE', false, true, true, 'VND', NOW(), NOW()),
  ('OTHER_EXPENSE', 'Chi phí khác bằng tiền mặt', 'EXPENSE', false, true, true, 'VND', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
