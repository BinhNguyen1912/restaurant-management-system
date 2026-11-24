import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { IsPublic } from '@/shared/decorators/auth.decorator'
import { PrismaService } from '@/shared/service/prisma.service'
import { RedisService } from '@/shared/service/redis.service'

/**
 * Healthcheck cho container/orchestrator (ticket #04).
 *
 * - Public (probe không có token) và bỏ qua throttler (probe gọi 10s/lần sẽ hết quota 40/phút).
 * - Kiểm cả 2 phụ thuộc thật: Postgres (SELECT 1) và Redis (set/get qua cache).
 * - Không lành mạnh thì trả 503, không phải 200 "cho có": orchestrator phải thấy để restart.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @IsPublic()
  @SkipThrottle()
  async check() {
    const startedAt = Date.now()
    const checks: Record<'database' | 'redis', 'up' | 'down'> = { database: 'down', redis: 'down' }
    const errors: string[] = []

    try {
      await this.prismaService.$queryRaw`SELECT 1`
      checks.database = 'up'
    } catch (error: any) {
      errors.push(`database: ${error?.message ?? error}`)
    }

    try {
      // PING thật (ioredis). Cache-manager không dùng được để probe: nó có fallback trong RAM
      // nên Redis chết vẫn trả "up" — healthcheck nói dối còn tệ hơn không có healthcheck.
      const pong = await Promise.race([
        this.redisService.ping(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout 2000ms')), 2000)),
      ])
      checks.redis = pong === 'PONG' ? 'up' : 'down'
      if (checks.redis === 'down') errors.push(`redis: PING trả "${pong}"`)
    } catch (error: any) {
      errors.push(`redis: ${error?.message ?? error}`)
    }

    const healthy = Object.values(checks).every((status) => status === 'up')
    const payload = {
      status: healthy ? 'ok' : 'error',
      checks,
      latencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      timezone: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      checkedAt: new Date().toISOString(),
      ...(errors.length ? { errors } : {}),
    }

    if (!healthy) throw new ServiceUnavailableException(payload)
    return payload
  }
}
