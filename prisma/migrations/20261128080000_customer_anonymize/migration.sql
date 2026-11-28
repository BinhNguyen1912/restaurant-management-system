-- Ẩn danh hoá hồ sơ khách hết thời hạn lưu (NĐ 13/2023/NĐ-CP).
-- `anonymizedAt` là dấu duy nhất để job biết hồ sơ nào đã xử lý ⇒ chạy lại nhiều lần vẫn an toàn.
ALTER TABLE "public"."Customer" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

ALTER TYPE "public"."AuditAction" ADD VALUE 'CUSTOMER_ANONYMIZED';
