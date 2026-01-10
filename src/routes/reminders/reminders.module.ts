import { Module } from '@nestjs/common'
import { RemindersService } from './reminders.service'
import { RemindersController } from './reminders.controller'
import { RemindersLogsModule } from '@/routes/reminders/remindersLog/remindersLog.module'
import { RemindersRepo } from './reminders.repo'

@Module({
  imports: [RemindersLogsModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersRepo],
  exports: [RemindersService],
})
export class RemindersModule {}
