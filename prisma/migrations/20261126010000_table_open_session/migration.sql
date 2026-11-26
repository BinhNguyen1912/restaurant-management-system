-- Bàn phải do NHÂN VIÊN mở thì khách mới quét QR gọi món được.
-- Lý do: trước đây chính khách quét QR tự set bàn thành OCCUPIED, nên ai có ảnh chụp QR
-- (gửi qua chat) cũng đặt món từ nhà, và còn chiếm bàn của khách thật.
ALTER TABLE "TableNode" ADD COLUMN "openedAt" TIMESTAMP(3);
ALTER TABLE "TableNode" ADD COLUMN "openedById" INTEGER;

ALTER TABLE "TableNode" ADD CONSTRAINT "TableNode_openedById_fkey"
  FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Bàn đang OCCUPIED từ trước được coi là đã mở (không tự đóng bàn khách đang ngồi).
UPDATE "TableNode" SET "openedAt" = NOW() WHERE "status" = 'OCCUPIED';
