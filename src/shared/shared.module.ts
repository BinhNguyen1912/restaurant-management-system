import { ReminderCronService } from '@/job/reminder-cron.service'
import { InventoryProcessor } from '@/processors/inventory.processor'
import { ReminderProcessor } from '@/processors/reminder.processor'
import envConfig from '@/shared/config'
import { Inventory_Queue, REMINDER_QUEUE } from '@/shared/constants/others.constant'
import { AccessTokenGuard } from '@/shared/guard/access-token.guard'
import { PaymentApiKeyGuard } from '@/shared/guard/payment-api-key.guard'
import { CloudinaryService } from '@/shared/service/cloudinary.service'
import { EmailService } from '@/shared/service/email.service'
import { HashingService } from '@/shared/service/hashing.service'
import { PrismaService } from '@/shared/service/prisma.service'
import { LedgerPostingService } from '@/shared/service/ledger-posting.service'
import { LedgerIntegrityService } from '@/shared/service/ledger-integrity.service'
import { RedisService } from '@/shared/service/redis.service'
import { AuditLogService } from '@/shared/service/audit-log.service'
import { VoucherService } from '@/shared/service/voucher.service'
import { TokenService } from '@/shared/service/token.service'
import { SharedGuestRepo } from '@/shared/shared-repository/shared-guest.repo'
import { SharedOrdersRepo } from '@/shared/shared-repository/shared-orders.repo'
import { SharedRefreshTokenRepo } from '@/shared/shared-repository/shared-refreshToken'
import { SharedRoleRepo } from '@/shared/shared-repository/shared-role.repo'
import { SharedSkuRecipeIngredientRepo } from '@/shared/shared-repository/shared-skuRecipeIngredient.repo'
import { SharedUserRepo } from '@/shared/shared-repository/shared-user.repo'
import { WebSocketRepo } from '@/shared/shared-repository/shared-webSocket'
import { AppGateway } from '@/webSockets/app.gateway'
import { BullModule } from '@nestjs/bullmq'
import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ScheduleModule } from '@nestjs/schedule'
import { VnPayService } from './service/vnpay.service'
import { SharedReservationRepo } from './shared-repository/shared-reservation.repo'
import { SharedTableNodeRepo } from './shared-repository/shared-tableNode.repo'
import { ReservationPaymentHandler } from './handler/ReservationPayment.handler'
import { OrderGuestPaymentPaymentHandler } from './handler/OrderPayment.handler'
const sharedService = [
  PrismaService,
  LedgerPostingService,
  LedgerIntegrityService,
  EmailService,
  HashingService,
  SharedUserRepo,
  TokenService,
  SharedRoleRepo,
  SharedRefreshTokenRepo,
  AccessTokenGuard,
  PaymentApiKeyGuard,
  CloudinaryService,
  RedisService,
  AuditLogService,
  VoucherService,
  SharedSkuRecipeIngredientRepo,
  InventoryProcessor,
  AppGateway,
  SharedOrdersRepo,
  SharedGuestRepo,
  WebSocketRepo,
  ReminderProcessor,
  VnPayService,
  SharedReservationRepo,
  SharedTableNodeRepo,
  OrderGuestPaymentPaymentHandler,
  ReservationPaymentHandler,
]

@Global()
@Module({
  imports: [
    JwtModule,
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: { url: envConfig.REDIS_URL },
    }),
    BullModule.registerQueue({
      name: Inventory_Queue,
    }),
    BullModule.registerQueue({
      name: REMINDER_QUEUE,
    }),
  ],
  providers: sharedService,
  exports: [...sharedService, BullModule],
})
export class SharedModule {}
