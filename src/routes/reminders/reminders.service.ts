import { CACHE_KEYS, CACHE_TTL } from '@/cache/cache.constant'
import { CacheService } from '@/cache/services/cache.service'
import { CreateReminderType, UpdateReminderType } from '@/routes/reminders/reminders.model'
import { RemindersRepo } from '@/routes/reminders/reminders.repo'
import { ReminderLogRepo } from '@/routes/reminders/remindersLog/remindersLog.repo'
import { checkHasNextSchedule, getNextSchedule } from '@/shared/helper'
import { ReminderType } from '@/shared/models/shared-reminder.model'
import { ReminderLogsType } from '@/shared/models/shared-reminderLogs.model'

import { Injectable } from '@nestjs/common'

@Injectable()
export class RemindersService {
  constructor(
    private readonly reminderRepository: RemindersRepo,
    private readonly reminderLogRepository: ReminderLogRepo,
    private readonly cacheService: CacheService,
  ) {}

  async create({ createdById, data }: { data: CreateReminderType; createdById: number }): Promise<ReminderType> {
    const reminder = await this.reminderRepository.create({
      createdById,
      createReminderType: data,
    })

    await this.cacheService.cacheReminder({
      CACHE_TTL: CACHE_TTL.REMINDER_ACTIVE,
      reminder,
    })
    await this.cacheService.del(CACHE_KEYS.REMINDDER_ACTIVE)

    return this.enrichWithScheduleInfo(reminder)
  }

  async findAllActive(useCache: boolean = true): Promise<ReminderType[]> {
    if (useCache) {
      const cached = await this.cacheService.getCachedReminders({
        CACHE_KEY: CACHE_KEYS.REMINDDER_ACTIVE,
        CACHE_TTL: CACHE_TTL.REMINDER_ACTIVE,
      })
      if (cached) {
        return cached.map((reminder) => this.enrichWithScheduleInfo(reminder))
      }
    }

    const reminders = await this.reminderRepository.findAllActive()
    const enrichedReminders = reminders.map((reminder) => this.enrichWithScheduleInfo(reminder))

    await this.cacheService.cacheActiveReminders({
      reminders: enrichedReminders,
      CACHE_KEY: CACHE_KEYS.REMINDDER_ACTIVE,
      CACHE_TTL: CACHE_TTL.REMINDER_ACTIVE,
    })

    return enrichedReminders
  }

  async findByRole(assigned_role: number, useCache: boolean = true): Promise<ReminderType[]> {
    if (useCache) {
      const cached = await this.cacheService.getCachedRemindersByRole({
        role: assigned_role,
        CACHE_TTL: CACHE_TTL.REMINDER_ACTIVE,
      })
      if (cached) return cached.map((reminder) => this.enrichWithScheduleInfo(reminder))
    }

    const reminders = await this.reminderRepository.findByRole(assigned_role)
    const enrichedReminders = reminders.map((reminder) => this.enrichWithScheduleInfo(reminder))

    await this.cacheService.cacheRemindersByRole({
      role: assigned_role,
      reminders: enrichedReminders,
      CACHE_TTL: CACHE_TTL.REMINDER_ACTIVE,
    })

    return enrichedReminders
  }

  async getDueReminders(): Promise<ReminderType[]> {
    const now = new Date()
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    const currentDay = now.getDay()

    // console.log(` [getDueReminders] Checking at ${currentTime} (Day: ${currentDay})`)

    // Lấy reminders đã đến hạn (cả scheduled_date và time_to_remind)
    const dueReminders = await this.reminderRepository.findDueReminders(currentTime, currentDay)

    // console.log(` [getDueReminders] Found ${dueReminders.length} reminders from database query`)

    // Lọc thêm: Nếu có scheduled_date, chỉ lấy những cái match chính xác ngày giờ
    const filteredReminders = dueReminders.filter((reminder) => {
      if (reminder.scheduled_date) {
        const scheduledDate = new Date(reminder.scheduled_date)

        // Lấy local time từ scheduledDate (database lưu UTC, nhưng Date object tự động convert về local)
        const scheduledTime = `${scheduledDate.getHours().toString().padStart(2, '0')}:${scheduledDate.getMinutes().toString().padStart(2, '0')}`
        const scheduledDateOnly = new Date(
          scheduledDate.getFullYear(),
          scheduledDate.getMonth(),
          scheduledDate.getDate(),
        )
        const currentDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate())

        // console.log(` [filter] Checking reminder ${reminder.id}:`)
        // console.log(
        //   `  - Scheduled date (local): ${scheduledDate.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
        // )
        // console.log(`  - Scheduled time: ${scheduledTime}, Current time: ${currentTime}`)
        // console.log(`  - Scheduled date only: ${scheduledDateOnly.toISOString()}`)
        // console.log(`  - Current date only: ${currentDateOnly.toISOString()}`)
        // console.log(`  - Match date: ${scheduledDateOnly.getTime() === currentDateOnly.getTime()}`)
        // console.log(`  - Match time: ${scheduledTime === currentTime}`)

        // Check ngày và giờ (so sánh local time)
        const matches = scheduledDateOnly.getTime() === currentDateOnly.getTime() && scheduledTime === currentTime
        // console.log(`  - Result: ${matches ? '✅ MATCH' : '❌ NO MATCH'}`)

        return matches
      }
      // Nếu không có scheduled_date, dùng logic cũ
      return true
    })

    // console.log(` [getDueReminders] After filtering: ${filteredReminders.length} reminders`)

    return filteredReminders.map((reminder) => this.enrichWithScheduleInfo(reminder))
  }

  async createReminderLog(reminderId: number, scheduledAt: Date): Promise<void> {
    await this.reminderLogRepository.create({
      reminder_id: reminderId,
      scheduled_at: scheduledAt.toISOString(),
      status: 'PENDING',
    })
  }

  async completeReminderLog(logId: number, userId: number): Promise<ReminderLogsType> {
    return await this.reminderLogRepository.markAsCompleted(logId, userId)
  }

  async findById(id: number): Promise<ReminderType | null> {
    const reminder = await this.reminderRepository.findById(id)
    if (!reminder) return null
    return this.enrichWithScheduleInfo(reminder)
  }

  async update({
    reminderId,
    updateData,
    updatedById,
  }: {
    reminderId: number
    updateData: UpdateReminderType
    updatedById: number
  }): Promise<ReminderType> {
    const reminder = await this.reminderRepository.update({
      reminderId,
      updateReminderType: updateData,
      updatedById,
    })

    // Clear cache
    await this.cacheService.del(CACHE_KEYS.REMINDDER_ACTIVE)
    if (reminder.assigned_role && reminder.assigned_role.length > 0) {
      for (const roleId of reminder.assigned_role) {
        await this.cacheService.del(`reminders:role:${roleId}`)
      }
    }

    return this.enrichWithScheduleInfo(reminder)
  }

  async softDelete(reminderId: number, deletedById: number): Promise<ReminderType> {
    const reminder = await this.reminderRepository.softDelete(reminderId, deletedById)

    // Clear cache
    await this.cacheService.del(CACHE_KEYS.REMINDDER_ACTIVE)
    if (reminder.assigned_role && reminder.assigned_role.length > 0) {
      for (const roleId of reminder.assigned_role) {
        await this.cacheService.del(`reminders:role:${roleId}`)
      }
    }

    return this.enrichWithScheduleInfo(reminder)
  }

  async getReminderLogs(reminderId: number): Promise<ReminderLogsType[]> {
    return await this.reminderLogRepository.findByReminderId(reminderId)
  }

  private enrichWithScheduleInfo(reminder: any): ReminderType {
    const nextSchedule = getNextSchedule(reminder)
    const hasNextSchedule = checkHasNextSchedule(reminder)

    return {
      ...reminder,
      nextSchedule,
      hasNextSchedule,
    }
  }
}
