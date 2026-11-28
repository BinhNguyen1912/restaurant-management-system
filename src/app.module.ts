import { CashShiftModule } from '@/routes/cash-shift/cash-shift.module'
import { LedgerEntryModule } from '@/routes/ledger-entry/ledger-entry.module'
import { ReportsModule } from '@/routes/reports/reports.module'
import { HealthModule } from '@/routes/health/health.module'
import { ReconciliationModule } from '@/routes/reconciliation/reconciliation.module'
import { AuditLogModule } from '@/routes/audit-log/audit-log.module'
import { VoucherModule } from '@/routes/voucher/voucher.module'
import { BranchModule } from '@/routes/branch/branch.module'
import { LedgerAccountModule } from '@/routes/ledger-account/ledger-account.module'
import { MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { SharedModule } from '@/shared/shared.module'
import { LanguageModule } from '@/routes/language/language.module'
import { AuthModule } from '@/routes/auth/auth.module'
import { RefreshTokenCleanupService } from '@/job/RefreshTokenCleanup.service'
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod'
import { HttpExceptionFilter } from '@/filter/http-exception.filter'
import { AuthenticationGuard } from '@/shared/guard/authentication.guard'
import { CategoryModule } from '@/routes/categories/category.module'
import { CategoryTranslationModule } from '@/routes/categories/category-translation/category-translation.module'
import { ProfileModule } from '@/routes/profile/profile.module'
import { PermissionModule } from '@/routes/permission/permission.module'
import { TableModule } from '@/routes/table/table.module'
import { RoleModule } from '@/routes/role/role.module'
import { MediaModule } from '@/routes/media/media.module'
import { UnitModule } from '@/routes/unit/unit.module'
import { IngredientModule } from '@/routes/ingredients/ingredient.module'
import { ProductModule } from '@/routes/products/product.module'
import { ProductTranslationModule } from '@/routes/products/product-translation/product-translation.module'
import { RecipeModule } from '@/routes/recipe/recipe.module'
import { UnitConversionModule } from '@/routes/unitConversion/unitConversion.module'
import { AreaModule } from './routes/area/area.module'
import { TableLayoutModule } from './routes/table-layout/table-layout.module'
import { TableNodeModule } from './routes/table-node/table-node.module'
import { UsersModule } from './routes/users/users.module'
import { WebSocketRepo } from '@/shared/shared-repository/shared-webSocket'
import { GuestModule } from '@/routes/guest/guest.module'
import { WebSocketsModule } from '@/webSockets/websockets.module'
import { CacheModule } from '@nestjs/cache-manager'
import * as redisStore from 'cache-manager-redis-store'
import envConfig from '@/shared/config'
import { RedisCacheModule } from '@/cache/cache.module'
import { OrdersModule } from './routes/orders/orders.module'
import { DashboardModule } from './routes/dashboard/dashboard.module'
import { PaymentModule } from './routes/payment/payment.module'
import { MessageModule } from './routes/messages/message.module'
import { RequestTimingMiddleware } from '@/shared/middleware/request-timing.middleware'
import { CacheLoaderService } from '@/cache/services/cacheLoader.service'
import { BullModule } from '@nestjs/bullmq'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerBehindProxyGuard } from '@/shared/guard/throttler-behind-proxy.guard'
import { AppGateway } from '@/webSockets/app.gateway'
import { RemindersModule } from './routes/reminders/reminders.module'
import { ReminderCronService } from '@/job/reminder-cron.service'
import { ReservationModule } from './routes/reservation/reservation.module';
@Module({
  imports: [
    LedgerAccountModule,
    CashShiftModule,
    LedgerEntryModule,
    ReportsModule,
    HealthModule,
    ReconciliationModule,
    AuditLogModule,
    VoucherModule,
    BranchModule,
    SharedModule,
    LanguageModule,
    AuthModule,
    CategoryModule,
    CategoryTranslationModule,
    ProfileModule,
    PermissionModule,
    TableModule,
    RoleModule,
    MediaModule,
    UnitModule,
    IngredientModule,
    ProductModule,
    ProductTranslationModule,
    RecipeModule,
    UnitConversionModule,
    AreaModule,
    TableNodeModule,
    TableLayoutModule,
    UsersModule,
    GuestModule,
    WebSocketsModule,
    RedisCacheModule,
    OrdersModule,
    DashboardModule,
    PaymentModule,
    MessageModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000, //1p
          // e2e bắn vài trăm request từ cùng một IP trong 1 phút nên ngưỡng 40 tự sinh 429 giữa
          // suite (đã xảy ra với GET /reports/revenue, làm cổng e2e đỏ ngẫu nhiên). Chỉ nới trong
          // test, giữ nguyên guard để test vẫn thấy nó được wire.
          limit: process.env.NODE_ENV === 'test' ? 10_000 : 40,
        },
      ],
    }),
    RemindersModule,
    ReservationModule,
  ],
  controllers: [AppController],
  providers: [
    WebSocketRepo,
    AppService,
    RefreshTokenCleanupService,
    ReminderCronService,
    {
      provide: 'APP_PIPE',
      useClass: ZodValidationPipe,
    },
    {
      provide: 'APP_INTERCEPTOR',
      useClass: ZodSerializerInterceptor,
    },
    {
      provide: 'APP_FILTER',
      useClass: HttpExceptionFilter,
    },
    {
      provide: 'APP_GUARD',
      useClass: AuthenticationGuard,
    },

    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
})
export class AppModule implements OnModuleInit, NestModule {
  constructor(private readonly cacheLoader: CacheLoaderService) {}

  /**
   * Đo request chỉ khi bật `LOG_REQUESTS=true`: tắt mặc định để log dev không bị rác.
   * Dùng khi cần biết trang nào chậm vì API nào.
   */
  configure(consumer: MiddlewareConsumer) {
    if (process.env.LOG_REQUESTS === 'true') {
      consumer.apply(RequestTimingMiddleware).forRoutes('*')
    }
  }

  async onModuleInit() {
    await this.cacheLoader.preloadAll()
  }
}
