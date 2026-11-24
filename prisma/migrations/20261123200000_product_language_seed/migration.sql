-- Bảng "Language" đang rỗng nên mọi ProductTranslation/CategoryTranslation không thể ghi được
-- (lỗi FK) => tên + mô tả đa ngôn ngữ của sản phẩm luôn rỗng.
INSERT INTO "Language" ("id", "name", "createdAt", "updatedAt")
VALUES
  ('vi', 'Tiếng Việt', NOW(), NOW()),
  ('en', 'English', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- Backfill translation 'vi' cho các sản phẩm đã tạo trước đây (lấy name từ Product.name)
INSERT INTO "ProductTranslation" ("name", "description", "productId", "languageId", "createdById", "createdAt", "updatedAt")
SELECT p."name", '', p."id", 'vi', p."createdById", NOW(), NOW()
FROM "Product" p
WHERE p."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ProductTranslation" t WHERE t."productId" = p."id" AND t."languageId" = 'vi'
  );
