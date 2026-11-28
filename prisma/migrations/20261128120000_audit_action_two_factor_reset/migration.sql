-- Thêm hành động nhật ký cho việc NGƯỜI VẬN HÀNH xoá 2FA của một tài khoản (prod-readiness
-- §M9 mục 5).
--
-- Vì sao cần: bắt buộc 2FA mà không có đường phục hồi thì mất điện thoại là mất tài khoản — với
-- quản trị viên duy nhất, đó là mất hệ thống. Đường phục hồi phải để lại dấu: ai xoá, của ai, vì lý
-- do gì. Xoá 2FA của người khác là tháo rào chắn bảo vệ tài khoản cao nhất trong hệ thống.

ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_RESET';
