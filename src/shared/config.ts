import { config } from 'dotenv'
import z from 'zod'
import fs from 'fs'
import path from 'path'
config({
  path: '.env',
})

if (!fs.existsSync(path.resolve('.env'))) {
  console.error('Không tìm thấy file .env')
  process.exit(1) //dừng chương trình
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
  console.log('Một số thuộc tính trong file .env không hợp lệ')
  console.error(configServer.error)
  process.exit(1) //dung chuong trinh
}

const envConfig = configServer.data

export default envConfig
