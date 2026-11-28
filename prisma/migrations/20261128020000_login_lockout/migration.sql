-- Khoá đăng nhập tạm theo tài khoản nhân viên (prod-readiness §0.2 #3).
--
-- Trước đây sai mật khẩu bao nhiêu lần cũng được: chỉ có throttler 40 request/phút/IP, vừa chặn
-- nhầm nhiều chi nhánh dùng chung một IP văn phòng, vừa không chặn được kẻ đổi IP. Hai cột dưới
-- giữ trạng thái ngay trên tài khoản nên khoá theo đúng người, không theo đường mạng.
--
-- Ngưỡng và thời hạn khoá nằm trong code (src/routes/auth/login-lockout.ts) để đổi được mà không
-- phải sửa migration; ở đây chỉ thêm cột với giá trị mặc định "chưa sai lần nào, không khoá".

ALTER TABLE "User"
  ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- Lần khoá phải để lại vết: khoá nhầm một tài khoản kế toán giữa giờ bán là việc phải giải trình được.
-- Postgres 12+ cho phép thêm giá trị enum trong transaction miễn là không dùng giá trị đó ngay
-- trong cùng transaction, nên không cần tách migration.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_LOCKED';
