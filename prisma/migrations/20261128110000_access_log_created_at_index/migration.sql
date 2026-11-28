-- Index `createdAt` cho AccessLog, phục vụ job dọn nhật ký theo thời hạn lưu (`npm run logs:prune`).
--
-- Bảng này đông nhất hệ thống (mỗi lượt ĐỌC PII của một người là một dòng) và trước đây chỉ có
-- index theo (subjectType, subjectId), (actorId), (route) — tất cả đều có `createdAt` ở cuối dãy.
-- Không có index này thì mỗi lần dọn là một lần quét toàn bảng.
--
-- Chỉ thêm index, không đổi dữ liệu.

CREATE INDEX "AccessLog_createdAt_idx" ON "public"."AccessLog"("createdAt");
