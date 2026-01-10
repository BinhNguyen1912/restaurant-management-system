import { ReminderLogRepo } from '@/routes/reminders/remindersLog/remindersLog.repo'
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

@Module({
  providers: [ReminderLogRepo],
  exports: [ReminderLogRepo],
})
export class RemindersLogsModule {}
