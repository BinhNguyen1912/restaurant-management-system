import { config } from 'dotenv'
import z from 'zod'
import fs from 'fs'
import path from 'path'

/**
 * Nạp cấu hình theo 2 đường:
 *  - **có file `.env`** (máy dev): đọc file như trước;
 *  - **không có file** (container/Docker/VPS): dùng biến môi trường của process.
 *
 * Trước đây module này `process.exit(1)` khi thiếu `.env`, nên image Docker không thể khởi động
 * dù đã truyền đủ biến qua `--env-file`/compose `environment` — deploy kiểu 12-factor không chạy
 * được. Kiểm tra "thiếu biến nào" vẫn giữ, chỉ bỏ yêu cầu phải CÓ FILE.
 */
const envFilePath = path.resolve('.env')
if (fs.existsSync(envFilePath)) {
  config({ path: envFilePath })
}

/**
 * Khoá bí mật.
 *
 * **Production** (container/staging/VPS): bắt buộc ≥ 32 ký tự và không phải giá trị mẫu trong repo
 * — copy nguyên `.env.production.example` mà chạy thì ai cũng ký được token ADMIN.
 * **Dev**: chỉ cần có giá trị. `.env` trên máy dev đang dùng khoá ngắn cho tiện; nếu chặn ở đây thì
 * cả `npm run dev` lẫn unit test đều chết ngay khi import config (đã xảy ra), mà dev thì không có
 * ai tấn công.
 */
const isProduction = process.env.NODE_ENV === 'production'
const secretSchema = (name: string) =>
  isProduction
    ? z
        .string()
        .min(32, `${name} phải dài tối thiểu 32 ký tự`)
        .refine((value) => !/^(thay_bang|doi_thanh|change_me|xxxx)/i.test(value.trim()), {
          message: `${name} vẫn là giá trị mẫu trong repo — tạo khoá thật: openssl rand -hex 32`,
        })
    : z.string().min(1, `${name} không được để trống`)

const configSchema = z.object({
  PORT: z.string(),
  DATABASE_URL: z.string(),
  Admin_name: z.string(),
  Admin_password: z.string(),
  Admin_email: z.string(),
  ADMIN_ID: z.string(),
  OTP_EXPIRES_IN: z.string().default('5m'),
  RESEND_API_KEY: z.string().min(10),
  /**
   * Hai khoá ký JWT: **bắt buộc đủ mạnh**.
   *
   * Trước đây chỉ `z.string()` nên copy nguyên `.env.production.example`
   * (`ACCESS_TOKEN_SECRET=thay_bang_chuoi_ngau_nhien_32_ky_tu`) là app vẫn chạy — với một khoá đã
   * **công khai trong repo**, ai cũng ký được token ADMIN. Chặn ở đây: tối thiểu 32 ký tự và
   * không chấp nhận chuỗi mẫu.
   */
  ACCESS_TOKEN_SECRET: secretSchema('ACCESS_TOKEN_SECRET'),
  REFRESH_TOKEN_SECRET: secretSchema('REFRESH_TOKEN_SECRET'),
  ACCESS_TOKEN_EXPIRES_IN: z.string(),
  REFRESH_TOKEN_EXPIRES_IN: z.string(),
  PAYMENT_API_KEY: z.string(),
  CLOUDINARY_NAME: z.string(),
  CLOUDINARY_KEY: z.string(),
  CLOUDINARY_SECRET: z.string(),
  REDIS_URL: z.string(),
  VNPAY_TMN_CODE: z.string(),
  VNPAY_SECRET_KEY: z.string(),
  VNPAY_URL: z.string(),
  VNPAY_RETURN_URL: z.string(),
  FRONTEND_URL: z.string(),
  VNPAY_API_URL: z.string(),
  /**
   * Thời hạn lưu của HAI BẢNG NHẬT KÝ (`AccessLog`, `LoginAttempt`), tính theo tháng.
   *
   * Cố ý `optional()` và **không có giá trị mặc định**: đây là con số do người ký chính sách đặt
   * (docs/pii-retention-policy.md §3), không phải do code chọn. Thiếu biến ⇒ job dọn tự bỏ qua và
   * ghi log lý do; app vẫn khởi động bình thường — thiếu một con số pháp lý không phải lý do để hệ
   * thống không lên được.
   */
  LOG_RETENTION_MONTHS: z.string().optional(),
})

const configServer = configSchema.safeParse(process.env)

if (!configServer.success) {
  // In rõ TÊN biến thiếu/sai — trong container không có file .env để mở ra xem
  const missing = configServer.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n  ')
  console.error(
    `Cấu hình không hợp lệ (kiểm tra file .env khi chạy local, hoặc biến môi trường khi chạy container):\n  ${missing}`,
  )
  process.exit(1)
}

const envConfig = configServer.data

export default envConfig
