/*
  Warnings:

  - Made the column `tableNodeId` on table `Reservation` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Reservation" DROP CONSTRAINT "Reservation_tableNodeId_fkey";

-- AlterTable
ALTER TABLE "public"."Reservation" ALTER COLUMN "tableNodeId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_tableNodeId_fkey" FOREIGN KEY ("tableNodeId") REFERENCES "public"."TableNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
