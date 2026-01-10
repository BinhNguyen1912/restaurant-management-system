import { Injectable, Inject } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import type { Cache } from 'cache-manager'
import { CACHE_KEYS, CACHE_TTL } from '@/cache/cache.constant'

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async get<T>(key: string): Promise<T | null> {
    return await this.cache.get<T>(key)
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cache.set(key, value, ttl || 0)
  }

  async del(key: string): Promise<void> {
    await this.cache.del(key)
  }

  // Optional: hash-like caching
  async hset(hash: string, field: string, value: any) {
    const key = `${hash}:${field}`
    await this.cache.set(key, value, 0)
  }

  async hget<T>(hash: string, field: string): Promise<T | null> {
    const key = `${hash}:${field}`
    return this.cache.get<T>(key)
  }

  async setUnitConversion(from: string, to: string, factor: number) {
    const key = `unit:conv:${from}:${to}`
    await this.set(key, factor, CACHE_TTL.UNIT_CONVERSION)
  }

  async getUnitConversion(from: string, to: string): Promise<number | null> {
    const key = `unit:conv:${from}:${to}`
    return this.get<number>(key)
  }

  // Active reminders cache
  async cacheActiveReminders({
    CACHE_KEY,
    CACHE_TTL,
    reminders,
  }: {
    reminders: any[]
    CACHE_KEY: string
    CACHE_TTL: number
  }): Promise<void> {
    await this.set(
      CACHE_KEY,
      {
        data: reminders,
        timestamp: Date.now(),
      },
      CACHE_TTL,
    )
  }

  async getCachedReminders({ CACHE_KEY, CACHE_TTL }: { CACHE_KEY: string; CACHE_TTL: number }): Promise<any[] | null> {
    const cached = await this.get<any>(CACHE_KEY)
    if (!cached) return null

    const cacheAge = Date.now() - cached.timestamp
    if (cacheAge > CACHE_TTL * 1000) {
      await this.del(CACHE_KEY)
      return null
    }

    return cached.data
  }
  // Reminder cooldown methods
  async setReminderCooldown(reminderId: number, minutes: number = 5): Promise<void> {
    const cooldownKey = this.getReminderCooldownKey(reminderId)
    await this.set(cooldownKey, '1', minutes * 60)
  }

  async isReminderInCooldown(reminderId: number): Promise<boolean> {
    const cooldownKey = this.getReminderCooldownKey(reminderId)
    const result = await this.get<string>(cooldownKey)
    return !!result
  }

  private getReminderCooldownKey(reminderId: number): string {
    const now = new Date()
    return `reminder:cooldown:${reminderId}:${now.getHours()}:${now.getMinutes()}`
  }

  // Cache by role
  async cacheRemindersByRole({
    CACHE_TTL,
    reminders,
    role,
  }: {
    role: number
    reminders: any[]
    CACHE_TTL: number
  }): Promise<void> {
    // Cache key vẫn dùng single role để tìm reminders có chứa role đó
    const key = `reminders:role:${role}`
    await this.set(
      key,
      {
        data: reminders,
        timestamp: Date.now(),
      },
      CACHE_TTL,
    )
  }

  async getCachedRemindersByRole({ CACHE_TTL, role }: { role: number; CACHE_TTL: number }): Promise<any[] | null> {
    // Cache key vẫn dùng single role để tìm reminders có chứa role đó
    const key = `reminders:role:${role}`
    const cached = await this.get<any>(key)
    if (!cached) return null

    const cacheAge = Date.now() - cached.timestamp
    if (cacheAge > CACHE_TTL * 1000) {
      await this.del(key)
      return null
    }

    return cached.data
  }

  // Individual reminder cache
  async cacheReminder({ CACHE_TTL, reminder }: { reminder: any; CACHE_TTL: number }): Promise<void> {
    const key = `reminder:${reminder.id}`
    await this.set(key, reminder, CACHE_TTL)
  }

  async getCachedReminder(reminderId: number): Promise<any | null> {
    const key = `reminder:${reminderId}`
    return await this.get<any>(key)
  }

  async cacheReminderLogs(reminderId: number, logs: any[]): Promise<void> {
    const key = `reminder:${reminderId}:logs`
    await this.set(
      key,
      {
        data: logs,
        timestamp: Date.now(),
      },
      900,
    )
  }

  async getCachedReminderLogs(reminderId: number): Promise<any[] | null> {
    const key = `reminder:${reminderId}:logs`
    const cached = await this.get<any>(key)
    return cached?.data || null
  }

  // Bulk reminder cache operations
  async cacheRemindersBulk(reminders: any[]): Promise<void> {
    const promises = reminders.map((reminder) => this.cacheReminder({ reminder, CACHE_TTL: CACHE_TTL.REMINDER_ACTIVE }))
    await Promise.all(promises)
  }

  // Clear all reminder-related cache
  async clearAllReminderCache(): Promise<void> {
    await this.del(CACHE_KEYS.REMINDDER_ACTIVE)
  }

  // Reminder cache statistics (optional)
  async getReminderCacheStats(): Promise<{
    totalCached: number
    rolesCached: number
  }> {
    return {
      totalCached: 0,
      rolesCached: 0,
    }
  }
}
