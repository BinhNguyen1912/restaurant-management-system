/*
  Warnings:

  - You are about to alter the column `depositAmount` on the `Reservation` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,2)` to `Integer`.

*/
-- AlterTable
ALTER TABLE "public"."Reservation" ALTER COLUMN "depositAmount" SET DATA TYPE INTEGER;
