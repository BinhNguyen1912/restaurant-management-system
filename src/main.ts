// PHẢI là import đầu tiên: đặt TZ trước khi bất kỳ module nào khởi tạo Date (ticket #04)
import '@/shared/config/timezone'
import { NestFactory, Reflector } from '@nestjs/core'
import { AppModule } from './app.module'
import envConfig from '@/shared/config'
import { TransformerInterceptor } from '@/interceptor/tranformerData.interceptor'
import { WebSocketAuthAdapter } from '@/webSockets/webSocket.adapter'
import { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import CustomZodValidationPipe from './pipe/customZodValidation'
import { PrismaService } from '@/shared/service/prisma.service'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  })
  // Đóng Prisma/BullMQ/Redis đúng cách khi container nhận SIGTERM (ticket #04)
  app.enableShutdownHooks()
  app.set('trust proxy', 'loopback')

  const reflector = app.get(Reflector)
  app.useGlobalPipes(new CustomZodValidationPipe())

  /**
   * CORS: production chỉ cho phép domain của FE (env `FRONTEND_URL`, nhiều domain cách nhau dấu phẩy).
   *
   * `origin: '*'` không dùng được khi cookie auth là `secure`/httpOnly trên 2 domain khác nhau —
   * và cũng là lỗ hổng (mọi site gọi API được). Ngoài production vẫn để `*` cho tiện dev.
   */
  const allowedOrigins = (envConfig.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' && allowedOrigins.length > 0 ? allowedOrigins : '*',
    credentials: true,
  })
  app.use(helmet()) //
  app.useWebSocketAdapter(new WebSocketAuthAdapter(app))
  await app.listen(envConfig.PORT ?? 3000)

  console.log(`Server is running on http://localhost:${envConfig.PORT}`)

  await warnIfPermissionsMissing(app)
}

/**
 * Quyền được seed bằng script (`npm run create-permissions`), không tự sinh khi chạy.
 * Quên bước đó sau khi thêm route mới ⇒ **mọi route mới trả 403 cho tất cả, kể cả ADMIN** — lỗi
 * rất khó lần vì log không nói gì. Cảnh báo ngay lúc khởi động để người vận hành biết.
 *
 * KHÔNG tự chạy script: script đó gán lại quyền theo policy trong code, chạy mỗi lần khởi động sẽ
 * **xoá mọi thay đổi quyền đã làm trên UI**.
 */
async function warnIfPermissionsMissing(app: NestExpressApplication) {
  try {
    const router = app.getHttpAdapter().getInstance()._router
    const routeCount = new Set(
      (router?.stack ?? [])
        .filter((layer: any) => layer.route)
        .map((layer: any) => `${Object.keys(layer.route.methods)[0].toUpperCase()}:${layer.route.path}`),
    ).size
    const prisma = app.get(PrismaService)
    const permissionCount = await prisma.permission.count({ where: { deletedAt: null } })
    if (permissionCount < routeCount) {
      console.warn(
        `⚠️  Có ${routeCount - permissionCount} route CHƯA có permission (DB: ${permissionCount}/${routeCount}). ` +
          `Chạy "npm run create-permissions" rồi khởi động lại, nếu không các route mới sẽ trả 403 cho mọi vai trò.`,
      )
    }
  } catch (error: any) {
    console.warn('Không kiểm tra được permission lúc khởi động:', error?.message ?? error)
  }
}
bootstrap()
