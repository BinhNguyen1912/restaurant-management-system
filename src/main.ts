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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  })
  // Đóng Prisma/BullMQ/Redis đúng cách khi container nhận SIGTERM (ticket #04)
  app.enableShutdownHooks()
  app.set('trust proxy', 'loopback')

  const reflector = app.get(Reflector)
  app.useGlobalPipes(new CustomZodValidationPipe())

  app.enableCors({
    origin: '*',
  })
  app.use(helmet()) //
  app.useWebSocketAdapter(new WebSocketAuthAdapter(app))
  await app.listen(envConfig.PORT ?? 3000)

  console.log(`Server is running on http://localhost:${envConfig.PORT}`)
}
bootstrap()
