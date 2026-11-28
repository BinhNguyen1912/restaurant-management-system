-- Counter dùng lượt voucher để CLAIM NGUYÊN TỬ.
--
-- Trước đây `VoucherService.apply` đếm `VoucherSnapshot` rồi mới `create` — hai request đồng thời
-- (2 bàn, 2 khách) cùng đọc `usedCount = usageLimit - 1` và cùng tạo snapshot ⇒ dùng vượt hạn mức.
-- Với voucher 100% hoặc FIXED lớn, đây là mất tiền thật.
--
-- Backfill từ snapshot hiện có để số liệu không "reset" sau khi migrate.

ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "usedCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Voucher" v
SET "usedCount" = s.cnt
FROM (
  SELECT "voucherId", COUNT(*)::int AS cnt
  FROM "VoucherSnapshot"
  GROUP BY "voucherId"
) s
WHERE s."voucherId" = v."id";
