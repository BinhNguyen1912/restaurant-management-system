-- =====================================================================
-- Query lấy dữ liệu cho res-mana-system (Postgres, DB "ecommerce" ở port 5433)
--
-- Cách chạy nhanh (Docker):
--   docker exec -i res-mana-postgres psql -U postgres -d ecommerce < prisma/queries/report.sql
-- hoặc mở file này trong DataGrip/pgAdmin rồi chạy từng block.
--
-- Tên bảng/cột = tên model/cột trong prisma/schema.prisma (Prisma không @@map nên phải quote:
-- "Product", "Payment", "grandTotal", ...).
-- =====================================================================

SET client_encoding TO 'UTF8';

-- ---------------------------------------------------------------------
-- 1. Toàn bộ menu: món + giá + SKU + danh mục + bản dịch
-- ---------------------------------------------------------------------
SELECT
  p."id"                                            AS product_id,
  p."name"                                          AS ten_mon,
  p."basePrice"                                     AS gia_co_ban,
  p."virtualPrice"                                  AS gia_ao,
  p."status"                                        AS trang_thai,
  p."publishedAt"                                   AS cong_khai_luc,
  cardinality(p."images")                           AS so_anh,
  coalesce(
    (SELECT string_agg(c."name", ', ')
     FROM "_CategoryToProduct" cp JOIN "Category" c ON c."id" = cp."A"
     WHERE cp."B" = p."id"),
    '—'
  )                                                 AS danh_muc,
  coalesce(
    (SELECT string_agg(t."languageId", ',') FROM "ProductTranslation" t
     WHERE t."productId" = p."id" AND t."deletedAt" IS NULL),
    'KHONG_CO'
  )                                                 AS ban_dich,
  (SELECT count(*) FROM "SKU" s
   WHERE s."productId" = p."id" AND s."deletedAt" IS NULL) AS so_sku
FROM "Product" p
WHERE p."deletedAt" IS NULL
ORDER BY p."id";


-- ---------------------------------------------------------------------
-- 2. Chi tiết SKU của từng món
-- ---------------------------------------------------------------------
SELECT
  s."productId"   AS product_id,
  p."name"        AS ten_mon,
  s."id"          AS sku_id,
  s."value"       AS sku_value,
  s."price"       AS gia,
  s."status"      AS trang_thai,
  left(s."image", 60) AS anh
FROM "SKU" s
JOIN "Product" p ON p."id" = s."productId"
WHERE s."deletedAt" IS NULL AND p."deletedAt" IS NULL
ORDER BY s."productId", s."id";


-- ---------------------------------------------------------------------
-- 3. Doanh thu theo ngày (theo Payment đã trả) + đối chiếu Order.grandTotal
--    Lưu ý: Payment.status = 'SUCCESS' là tiền đã vào; REFUNDED đã hoàn.
-- ---------------------------------------------------------------------
SELECT
  date_trunc('day', coalesce(pay."paidAt", pay."createdAt")) AS ngay,
  pay."method"                                              AS phuong_thuc,
  pay."status"                                              AS trang_thai,
  count(*)                                                  AS so_giao_dich,
  sum(pay."amount")                                         AS tong_tien
FROM "Payment" pay
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;


-- ---------------------------------------------------------------------
-- 4. Món bán chạy (từ snapshot món trong đơn, đơn không bị xoá)
-- ---------------------------------------------------------------------
SELECT
  snap."productName"                 AS ten_mon,
  snap."skuValue"                    AS sku,
  sum(snap."quantity")               AS so_luong_ban,
  sum(snap."quantity" * snap."skuPrice") AS doanh_thu
FROM "ProductSKUSnapshot" snap
JOIN "Order" o ON o."id" = snap."orderId"
WHERE o."deletedAt" IS NULL
GROUP BY 1, 2
ORDER BY so_luong_ban DESC, doanh_thu DESC
LIMIT 20;


-- ---------------------------------------------------------------------
-- 5. Đơn hàng + thanh toán + chênh lệch grandTotal (phát hiện đơn tính sai tiền)
-- ---------------------------------------------------------------------
SELECT
  o."id"                                   AS order_id,
  o."status"                               AS trang_thai,
  o."branchId"                             AS chi_nhanh,
  o."subtotal", o."discountTotal", o."serviceChargeAmount", o."taxTotal", o."tipAmount",
  o."grandTotal"                           AS tong_don,
  pay."amount"                             AS tien_thanh_toan,
  (o."grandTotal" - pay."amount")          AS chenh_lech,
  pay."method", pay."status"               AS tt_status,
  o."createdAt"
FROM "Order" o
JOIN "Payment" pay ON pay."id" = o."paymentId"
WHERE o."deletedAt" IS NULL
ORDER BY o."createdAt" DESC
LIMIT 50;


-- ---------------------------------------------------------------------
-- 6. Sổ cái: cân đối phát sinh theo tài khoản (chỉ bút toán POSTED)
-- ---------------------------------------------------------------------
SELECT
  acc."code"                                       AS tai_khoan,
  acc."name"                                       AS ten_tai_khoan,
  acc."type"                                       AS loai,
  acc."isCash"                                     AS la_tien_mat,
  coalesce(sum(CASE WHEN l."direction" = 'DEBIT'  THEN l."amount" END), 0) AS tong_no,
  coalesce(sum(CASE WHEN l."direction" = 'CREDIT' THEN l."amount" END), 0) AS tong_co,
  coalesce(sum(CASE WHEN l."direction" = 'DEBIT'  THEN l."amount" END), 0)
    - coalesce(sum(CASE WHEN l."direction" = 'CREDIT' THEN l."amount" END), 0) AS so_du_no,
  count(l."id")                                    AS so_but_toan
FROM "LedgerAccount" acc
LEFT JOIN "LedgerLine" l ON l."accountId" = acc."id"
LEFT JOIN "LedgerEntry" e ON e."id" = l."entryId" AND e."status" = 'POSTED'
WHERE l."id" IS NULL OR e."id" IS NOT NULL
GROUP BY 1, 2, 3, 4
ORDER BY 1;


-- ---------------------------------------------------------------------
-- 7. Bút toán chi tiết (50 mới nhất) — kiểm tra Nợ = Có từng entry
-- ---------------------------------------------------------------------
SELECT
  e."id"                                        AS entry_id,
  e."status",
  e."refType"                                   AS nghiep_vu,
  e."refId"                                     AS tham_chieu,
  e."occurredAt",
  sum(CASE WHEN l."direction" = 'DEBIT'  THEN l."amount" ELSE 0 END) AS tong_no,
  sum(CASE WHEN l."direction" = 'CREDIT' THEN l."amount" ELSE 0 END) AS tong_co,
  string_agg(acc."code" || ':' || l."direction" || ':' || l."amount", ' | ') AS but_toan
FROM "LedgerEntry" e
LEFT JOIN "LedgerLine" l ON l."entryId" = e."id"
LEFT JOIN "LedgerAccount" acc ON acc."id" = l."accountId"
GROUP BY e."id", e."status", e."refType", e."refId", e."occurredAt"
ORDER BY e."id" DESC
LIMIT 50;


-- ---------------------------------------------------------------------
-- 8. Kiểm tra dữ liệu bẩn (dùng sau khi seed / sau khi nhập tay)
-- ---------------------------------------------------------------------
SELECT 'product thiếu bản dịch' AS van_de, p."id", p."name" AS gia_tri
FROM "Product" p
WHERE p."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ProductTranslation" t WHERE t."productId" = p."id" AND t."deletedAt" IS NULL)
UNION ALL
SELECT 'product không có SKU', p."id", p."name"
FROM "Product" p
WHERE p."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "SKU" s WHERE s."productId" = p."id" AND s."deletedAt" IS NULL)
UNION ALL
SELECT 'ảnh không phải URL http(s)', p."id", img
FROM "Product" p, unnest(p."images") AS img
WHERE p."deletedAt" IS NULL AND img !~* '^https?://'
UNION ALL
SELECT 'danh mục trùng tên (không phân biệt hoa/thường)', min(c."id"), lower(c."name")
FROM "Category" c
WHERE c."deletedAt" IS NULL
GROUP BY lower(c."name")
HAVING count(*) > 1
ORDER BY van_de, gia_tri;
