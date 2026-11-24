-- Đối soát VNPay: bút toán chuyển tiền chờ về (VNPAY_CLEARING) sang BANK
ALTER TYPE "LedgerRefType" ADD VALUE IF NOT EXISTS 'VNPAY_SETTLEMENT';
