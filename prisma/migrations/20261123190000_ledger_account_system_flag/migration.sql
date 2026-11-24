-- Danh mục tài khoản: cố định (seed) cho tài khoản hệ thống, cho tạo cho tài khoản chi tiết.
--
-- 1. Thêm cờ isSystem: tài khoản mà code tham chiếu trực tiếp (CASH, VNPAY_CLEARING, ...)
--    không được đổi code/type, không được tắt, không được xoá.
-- 2. Seed 14 tài khoản hệ thống ngay trong migration để DB mới nào cũng có sẵn.

ALTER TABLE "public"."LedgerAccount" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "public"."LedgerAccount" ("code", "name", "type", "isCash", "currency", "isActive", "isSystem", "createdAt", "updatedAt")
VALUES
  ('CASH',               'Tiền mặt tại quầy',        'ASSET',     true,  'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('BANK',               'Tiền gửi ngân hàng',       'ASSET',     false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('VNPAY_CLEARING',     'Tiền VNPay chờ về',        'ASSET',     false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('INVENTORY',          'Hàng tồn kho',             'ASSET',     false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('TAX_PAYABLE',        'Thuế phải nộp',            'LIABILITY', false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DEPOSIT_LIABILITY',  'Tiền cọc khách trả trước', 'LIABILITY', false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('TIP_PAYABLE',        'Tip phải trả nhân viên',   'LIABILITY', false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('REVENUE_FOOD',       'Doanh thu món ăn',         'REVENUE',   false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SERVICE_CHARGE',     'Doanh thu phí phục vụ',    'REVENUE',   false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DISCOUNT',           'Giảm giá',                 'EXPENSE',   false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COGS',               'Giá vốn hàng bán',         'EXPENSE',   false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CASH_SHORTAGE',      'Thiếu tiền quỹ',           'EXPENSE',   false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CASH_OVERAGE',       'Thừa tiền quỹ',            'REVENUE',   false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ROUNDING_ADJUSTMENT','Chênh lệch làm tròn',      'REVENUE',   false, 'VND', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "isSystem" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Tài khoản nào đã tồn tại mà code nằm trong bộ hệ thống thì đánh dấu hệ thống
UPDATE "public"."LedgerAccount"
SET "isSystem" = true
WHERE "code" IN (
  'CASH','BANK','VNPAY_CLEARING','INVENTORY','TAX_PAYABLE','DEPOSIT_LIABILITY','TIP_PAYABLE',
  'REVENUE_FOOD','SERVICE_CHARGE','DISCOUNT','COGS','CASH_SHORTAGE','CASH_OVERAGE','ROUNDING_ADJUSTMENT'
);

CREATE INDEX "LedgerAccount_isSystem_idx" ON "public"."LedgerAccount"("isSystem", "code");
