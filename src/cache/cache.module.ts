import { Module, Global } from '@nestjs/common'
import { CacheModule } from '@nestjs/cache-manager'
import { redisStore } from 'cache-manager-redis-store'
import envConfig from '@/shared/config'
import { CacheService } from '@/cache/services/cache.service'
import { CacheLoaderService } from '@/cache/services/cacheLoader.service'

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        store: redisStore,
        url: envConfig.REDIS_URL,
      }),
    }),
  ],
  providers: [CacheService, CacheLoaderService],
  exports: [CacheService, CacheLoaderService],
})
export class RedisCacheModule {}
