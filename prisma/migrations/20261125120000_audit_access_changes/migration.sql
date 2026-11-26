-- Ticket #12: nhật ký thay đổi QUYỀN TRUY CẬP (ai cấp/thu hồi quyền, ai đổi vai trò/chi nhánh).
-- Lý do: vừa mở màn hình Phân quyền cho sửa trên UI thì phải có vết — nếu không, một lần
-- thu hồi quyền sai sẽ không truy được ai làm và lúc nào.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ROLE_PERMISSIONS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ROLE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ROLE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_ACCESS_CHANGED';

ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'ROLE';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'USER';
