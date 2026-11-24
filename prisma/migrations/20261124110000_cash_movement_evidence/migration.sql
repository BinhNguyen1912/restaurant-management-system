-- Chứng từ cho khoản thu/chi tiền mặt (ảnh hoá đơn, video biên nhận) — ticket 06 follow-up
ALTER TABLE "CashMovement" ADD COLUMN IF NOT EXISTS "evidenceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
