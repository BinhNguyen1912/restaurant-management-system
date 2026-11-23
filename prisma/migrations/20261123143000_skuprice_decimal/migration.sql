-- Ticket P0-2b: gia dong don chuyen tu Float sang Decimal de but toan khong sai so
-- Phai co USING vi Float (double precision) khong tu cast sang numeric duoc.
ALTER TABLE "public"."ProductSKUSnapshot"
  ALTER COLUMN "skuPrice" SET DATA TYPE DECIMAL(14,2) USING "skuPrice"::numeric(14,2);
