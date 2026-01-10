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

  async onModuleInit() {
    const scripts = [deduct_stock, revert_stock]
    const scriptDir = path.join(process.cwd(), 'src/scripts', 'lua')
    for (const scriptName of scripts) {
      try {
        const scriptPath = path.join(scriptDir, scriptName)
        const scriptContent = fs.readFileSync(scriptPath, 'utf8')
        this.luaScripts.set(scriptName.split('.')[0], scriptContent)
      } catch (error) {
        console.error(`Failed to load Lua script: ${scriptName}`, error)
        throw error
      }
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

  async del(key: string): Promise<void> {
    await this.redisClient.del(key)
  }
}
