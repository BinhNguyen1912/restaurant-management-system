-- Tiền lẻ đầu ca phải vào sổ quỹ.
--
-- `CashShift.openingFloat` được cộng vào `expectedCash` khi đóng ca, nhưng mở ca KHÔNG ghi bút
-- toán nào ⇒ số dư tài khoản CASH luôn nhỏ hơn tiền thật trong két đúng bằng tiền lẻ đầu ca, và
-- phần chênh lệch đó bị lẫn với lệch thật khi đối soát.
--
-- Mở ca ghi: Nợ CASH / Có CASH_FLOAT_SOURCE (nguồn tiền lẻ của quán, không phải doanh thu).

ALTER TYPE "LedgerRefType" ADD VALUE IF NOT EXISTS 'SHIFT_OPENING_FLOAT';

INSERT INTO "LedgerAccount" ("code", "name", "type", "isCash", "isSystem", "isActive", "currency", "createdAt", "updatedAt")
VALUES ('CASH_FLOAT_SOURCE', 'Tiền lẻ đầu ca (nguồn quỹ)', 'EQUITY', false, true, true, 'VND', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
