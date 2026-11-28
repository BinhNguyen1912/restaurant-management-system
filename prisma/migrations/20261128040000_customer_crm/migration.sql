-- Hồ sơ khách hàng (tầng CRM).
--
-- Trước đây "khách" chỉ tồn tại dưới dạng hai chuỗi tự do trên từng lượt đặt bàn
-- (`Reservation.customerName` / `customerPhone`) và một cột `Order.userId` không màn hình nào
-- đọc: gõ "Nguyễn A / 0901…" ba lần là ba khách khác nhau, không ai biết khách nào quay lại
-- hay chi bao nhiêu. Migration này tạo danh tính khách — một dòng = một người, khoá là SĐT đã
-- chuẩn hoá — rồi gộp dữ liệu cũ vào đó, để hồ sơ khách không bắt đầu từ con số 0 ở môi trường
-- đang chạy.

CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "userId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");
CREATE INDEX "Customer_deletedAt_createdAt_idx" ON "Customer"("deletedAt", "createdAt");

ALTER TABLE "Order" ADD COLUMN "customerId" INTEGER;
ALTER TABLE "Reservation" ADD COLUMN "customerId" INTEGER;

CREATE INDEX "Order_customerId_status_createdAt_idx" ON "Order"("customerId", "status", "createdAt");
CREATE INDEX "Reservation_customerId_reservationTime_idx" ON "Reservation"("customerId", "reservationTime");

ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Backfill.
--
-- Chuẩn hoá SĐT ở đây phải y hệt `normalizeCustomerPhone` (src/routes/customer/customer.identity.ts):
-- bỏ mọi ký tự không phải chữ số, đổi đầu số quốc tế 84… về 0…, chỉ nhận độ dài 9-11 chữ số.
-- SĐT rác (rỗng, "abc", 3 số) cố tình KHÔNG tạo khách: thà thiếu hồ sơ còn hơn gộp hai người
-- khác nhau vào cùng một dòng.
-- ---------------------------------------------------------------------------------------------

CREATE TEMP TABLE "_reservation_phone" AS
SELECT
  r."id" AS "reservationId",
  CASE WHEN length(d) = 11 AND d LIKE '84%' THEN '0' || substr(d, 3) ELSE d END AS "phone",
  btrim(r."customerName") AS "customerName",
  r."createdAt"
FROM (
  SELECT "id", "customerName", "createdAt", regexp_replace("customerPhone", '\D', '', 'g') AS d
  FROM "Reservation"
) r;

DELETE FROM "_reservation_phone" WHERE length("phone") NOT BETWEEN 9 AND 11;

-- 1) Khách đã có tài khoản: nguồn duy nhất có sẵn `userId`, nên dựng hồ sơ từ đây trước để
--    bước 2 chỉ việc gắn thêm lượt đặt bàn vào cùng dòng.
--    CHỈ tài khoản khách (role USER): nhân viên cũng có SĐT trong bảng User, nhưng họ không phải
--    khách — gộp họ vào đây là báo cáo khách hàng đếm cả đồng nghiệp.
INSERT INTO "Customer" ("phone", "name", "email", "userId", "createdAt", "updatedAt")
SELECT
  d."phone",
  COALESCE(NULLIF(btrim(u."name"), ''), d."phone"),
  u."email",
  u."id",
  u."createdAt",
  now()
FROM (
  SELECT
    u."id",
    CASE
      WHEN length(regexp_replace(u."phoneNumber", '\D', '', 'g')) = 11
       AND regexp_replace(u."phoneNumber", '\D', '', 'g') LIKE '84%'
      THEN '0' || substr(regexp_replace(u."phoneNumber", '\D', '', 'g'), 3)
      ELSE regexp_replace(u."phoneNumber", '\D', '', 'g')
    END AS "phone"
  FROM "User" u
  JOIN "Role" r ON r."id" = u."roleId"
  WHERE u."phoneNumber" IS NOT NULL AND u."deletedAt" IS NULL AND r."name" = 'USER'
) d
JOIN "User" u ON u."id" = d."id"
WHERE length(d."phone") BETWEEN 9 AND 11
ON CONFLICT ("phone") DO UPDATE SET "userId" = COALESCE("Customer"."userId", EXCLUDED."userId");

-- 2) Khách chỉ có trên lượt đặt bàn: một dòng mỗi SĐT, tên lấy từ lượt MỚI NHẤT (khách sửa tên
--    qua các lần đặt), ngày tạo hồ sơ lấy từ lượt CŨ NHẤT (khách quen thì hồ sơ đã có từ lâu).
INSERT INTO "Customer" ("phone", "name", "createdAt", "updatedAt")
SELECT
  m."phone",
  COALESCE(NULLIF((array_agg(m."customerName" ORDER BY m."createdAt" DESC))[1], ''), m."phone"),
  min(m."createdAt"),
  now()
FROM "_reservation_phone" m
GROUP BY m."phone"
ON CONFLICT ("phone") DO NOTHING;

UPDATE "Reservation" r
SET "customerId" = c."id"
FROM "_reservation_phone" m
JOIN "Customer" c ON c."phone" = m."phone"
WHERE r."id" = m."reservationId";

-- Đơn đặt trước của một lượt đặt bàn là của chính khách đó
UPDATE "Order" o
SET "customerId" = r."customerId"
FROM "Reservation" r
WHERE o."reservationId" = r."id" AND r."customerId" IS NOT NULL;

-- Đơn khác (khách tự đặt qua app) nhận diện qua tài khoản đã đăng ký
UPDATE "Order" o
SET "customerId" = c."id"
FROM "Customer" c
WHERE o."userId" = c."userId"
  AND c."userId" IS NOT NULL
  AND o."customerId" IS NULL;

-- Tài khoản đặt bàn nhưng không có SĐT trên `User`: gắn hồ sơ với tài khoản của lượt đặt gần nhất.
-- Cũng chỉ tài khoản khách (role USER) — nhân viên đặt bàn hộ khách không làm khách thành chính họ.
-- `NOT EXISTS` giữ bất biến `Customer.userId` là unique — nếu không, hai khách trùng tài khoản
-- (một người đặt bàn bằng hai SĐT) sẽ làm câu lệnh này nổ.
UPDATE "Customer" c
SET "userId" = s."userId"
FROM (
  SELECT DISTINCT ON (m."phone") m."phone", r."userId"
  FROM "_reservation_phone" m
  JOIN "Reservation" r ON r."id" = m."reservationId"
  JOIN "User" u ON u."id" = r."userId"
  JOIN "Role" ro ON ro."id" = u."roleId"
  WHERE r."userId" IS NOT NULL AND ro."name" = 'USER' AND u."deletedAt" IS NULL
  ORDER BY m."phone", r."createdAt" DESC
) s
WHERE c."phone" = s."phone"
  AND c."userId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Customer" other WHERE other."userId" = s."userId");

DROP TABLE "_reservation_phone";
