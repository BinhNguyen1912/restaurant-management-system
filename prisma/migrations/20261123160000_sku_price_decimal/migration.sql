-- AlterTable
ALTER TABLE "public"."SKU" ALTER COLUMN "price" SET DATA TYPE DECIMAL(14,2) USING "price"::numeric(14,2);

