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

const configSchema = z.object({
  PORT: z.string(),
  DATABASE_URL: z.string(),
  Admin_name: z.string(),
  Admin_password: z.string(),
  Admin_email: z.string(),
  ADMIN_ID: z.string(),
  OTP_EXPIRES_IN: z.string().default('5m'),
  RESEND_API_KEY: z.string().min(10),
  ACCESS_TOKEN_SECRET: z.string(),
  REFRESH_TOKEN_SECRET: z.string(),
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
