-- Ticket #02: cột TIỀN không được là Float. Float sai số nhị phân -> tổng đơn lệch 1 đồng,
-- và sổ cái chỉ nhận số đồng nguyên nên phải sinh dòng ROUNDING_ADJUSTMENT vô nghĩa.
ALTER TABLE "Product" ALTER COLUMN "basePrice" TYPE DECIMAL(14,2) USING "basePrice"::numeric(14,2);
ALTER TABLE "Product" ALTER COLUMN "virtualPrice" TYPE DECIMAL(14,2) USING "virtualPrice"::numeric(14,2);
ALTER TABLE "Voucher" ALTER COLUMN "discountValue" TYPE DECIMAL(14,2) USING "discountValue"::numeric(14,2);
ALTER TABLE "VoucherSnapshot" ALTER COLUMN "discountValue" TYPE DECIMAL(14,2) USING "discountValue"::numeric(14,2);

-- số tiền voucher đã giảm thực tế cho từng đơn (khác discountValue của voucher)
ALTER TABLE "VoucherSnapshot" ADD COLUMN "appliedDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0;
