-- AlterEnum
ALTER TYPE "public"."ReservationStatus" ADD VALUE 'DEPOSITED';

-- AlterTable
ALTER TABLE "public"."Reservation" ADD COLUMN     "check_in_time" TIMESTAMP(3);
