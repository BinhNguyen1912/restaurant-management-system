// src/shared/redis.service.ts
import envConfig from '@/shared/config'
import { Injectable, OnModuleInit, OnModuleDestroy, BadRequestException } from '@nestjs/common'
import Redis from 'ioredis'
import * as fs from 'fs'
import * as path from 'path'
import { deduct_stock, revert_stock } from '@/shared/constants/lua.constant'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis
  public luaScripts = new Map<string, string>()

  constructor() {
    this.redisClient = new Redis(envConfig.REDIS_URL)
  }

  /**
   * Nạp script Lua từ đĩa.
   *
   * Trước đây chỉ tìm `process.cwd()/src/scripts/lua` — chạy dev thì đúng, nhưng **image production
   * chỉ có `dist/`** nên app chết ngay lúc khởi động: `ENOENT /app/src/scripts/lua/deduct-stock.lua`.
   * Giờ thử lần lượt: bản trong `dist` (nest-cli copy asset), bản `src` (dev), rồi cwd.
   * Không tìm thấy thì báo rõ ĐÃ TÌM Ở ĐÂU thay vì ENOENT trần trụi.
   */
  async onModuleInit() {
    const scripts = [deduct_stock, revert_stock]
    const candidates = [
      path.join(__dirname, '..', '..', 'scripts', 'lua'), // dist/scripts/lua (image production)
      path.join(process.cwd(), 'dist', 'scripts', 'lua'),
      path.join(process.cwd(), 'src', 'scripts', 'lua'), // dev
    ]
    const scriptDir = candidates.find((dir) => fs.existsSync(dir))
    if (!scriptDir) {
      throw new Error(
        `Không tìm thấy thư mục script Lua. Đã thử: ${candidates.join(' | ')}. ` +
          'Kiểm tra nest-cli.json có copy asset *.lua vào dist (compilerOptions.assets).',
      )
    }
    for (const scriptName of scripts) {
      const scriptPath = path.join(scriptDir, scriptName)
      const scriptContent = fs.readFileSync(scriptPath, 'utf8')
      this.luaScripts.set(scriptName.split('.')[0], scriptContent)
    }
  }

  onModuleDestroy() {
    this.redisClient.quit()
  }

  async runLuaScript<T>(scriptContent: string, data: any): Promise<T> {
    const dataJson = JSON.stringify(data)
    const resultJson: any = await this.redisClient.eval(scriptContent, 0, dataJson)
    if (resultJson && resultJson.errors && resultJson.errors.length > 0) {
      throw new BadRequestException(resultJson.errors)
    }
    return JSON.parse(resultJson as string)
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    const payload = JSON.stringify(value)
    await this.redisClient.set(key, payload)
  }

  async getJson<T>(key: string): Promise<T | null> {
    const result = await this.redisClient.get(key)
    return result ? JSON.parse(result) : null
  }

  async setHash(key: string, fields: Record<string, any>): Promise<void> {
    const flat: Array<string> = []
    for (const [k, v] of Object.entries(fields)) {
      flat.push(k, String(v))
    }
    if (flat.length > 0) {
      await this.redisClient.hset(key, ...flat)
    }
  }

  async getHash<T>(key: string): Promise<Record<string, T> | null> {
    const result = await this.redisClient.hgetall(key)
    if (Object.keys(result).length === 0) {
      return null
    }
    return result as Record<string, T>
  }

  async setString<T extends string | number>(key: string, value: T): Promise<void> {
    await this.redisClient.set(key, String(value))
  }

  /** PING thật tới Redis (healthcheck) — không dùng cache-manager vì nó có fallback trong RAM */
  async ping(): Promise<string> {
    return this.redisClient.ping()
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key)
  }
}
