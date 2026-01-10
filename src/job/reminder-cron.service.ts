import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { CacheService } from '@/cache/services/cache.service'
import { REMINDER_QUEUE } from '@/shared/constants/others.constant'
import { RemindersService } from '@/routes/reminders/reminders.service'

@Injectable()
export class ReminderCronService {
  private readonly logger = new Logger(ReminderCronService.name)
  private isProcessing = false

  constructor(
    private readonly reminderService: RemindersService,
    private readonly cacheService: CacheService,
    @InjectQueue(REMINDER_QUEUE) private reminderQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkDueReminders() {
    if (this.isProcessing) {
      // this.logger.debug('Reminder check already in progress, skipping...')
      return
    }

    try {
      this.isProcessing = true
      // this.logger.log(' Starting reminder check...')

      const dueReminders = await this.reminderService.getDueReminders()

      // this.logger.log(` Checked reminders, found ${dueReminders.length} due reminder(s)`)

      if (dueReminders.length > 0) {
        // this.logger.log(` Found ${dueReminders.length} due reminders`)

        // Tạo jobs cho queue
        const jobs = dueReminders.map((reminder) => ({
          name: 'trigger-reminder',
          data: {
            reminderId: reminder.id,
            title: reminder.title,
            description: reminder.description,
            assignedRole: reminder.assigned_role,
            timestamp: new Date().toISOString(),
          },
          opts: {
            jobId: `reminder-${reminder.id}-${Date.now()}`, // Unique job ID
            delay: 0,
          },
        }))

        // Thêm jobs vào queue
        // this.logger.log(`[ReminderCronService] Adding ${jobs.length} jobs to queue...`)
        const addedJobs = await this.reminderQueue.addBulk(jobs)
        // this.logger.log(`[ReminderCronService] Successfully added jobs: ${JSON.stringify(addedJobs.map((j) => j.id))}`)

        // Set cooldown và tạo logs
        for (const reminder of dueReminders) {
          await this.cacheService.setReminderCooldown(reminder.id)
          await this.reminderService.createReminderLog(reminder.id, new Date())
        }

        // this.logger.log(`[ReminderCronService] Added ${jobs.length} reminder jobs to queue`)

        const [waiting, active] = await Promise.all([this.reminderQueue.getWaiting(), this.reminderQueue.getActive()])
        // this.logger.log(`[ReminderCronService] Queue status - Waiting: ${waiting.length}, Active: ${active.length}`)
      } else {
        // this.logger.debug('No due reminders found at this time')
      }
    } catch (error) {
      // this.logger.error('Error reminders:', error)
    } finally {
      this.isProcessing = false
    }
  }

  // Cleanup job chạy mỗi ngày lúc 2h sáng
  @Cron('0 2 * * *')
  async scheduleCleanup() {
    try {
      await this.reminderQueue.add(
        'cleanup-reminders',
        {},
        {
          delay: 0,
          removeOnComplete: true,
        },
      )
      this.logger.log('Scheduled reminder cleanup job')
    } catch (error) {
      this.logger.error('Failed to schedule cleanup job:', error)
    }
  }

  // Method để lấy queue metrics (optional)
  async getQueueStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.reminderQueue.getWaiting(),
        this.reminderQueue.getActive(),
        this.reminderQueue.getCompleted(),
        this.reminderQueue.getFailed(),
        this.reminderQueue.getDelayed(),
      ])

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      }
    } catch (error) {
      this.logger.error('Failed to get queue stats:', error)
      return null
    }
  }
}
