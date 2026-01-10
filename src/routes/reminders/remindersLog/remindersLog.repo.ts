import { CreateReminderLogType, UpdateReminderLogType } from '@/routes/reminders/remindersLog/remindersLog.model'
import { StatusReminder } from '@/shared/constants/reminder.constant'
import { ReminderLogsType } from '@/shared/models/shared-reminderLogs.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class ReminderLogRepo {
  constructor(private readonly prismaService: PrismaService) {}
  async create(data: CreateReminderLogType): Promise<ReminderLogsType> {
    return this.prismaService.reminderLogs.create({
      data,
    })
  }

  async findByReminderId(reminder_id: number): Promise<ReminderLogsType[]> {
    return this.prismaService.reminderLogs.findMany({
      where: { reminder_id },
      orderBy: { scheduled_at: 'desc' },
      include: {
        completeBy: {
          select: { id: true, name: true },
        },
      },
    })
  }

  async update(id: number, data: UpdateReminderLogType): Promise<ReminderLogsType> {
    return this.prismaService.reminderLogs.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    })
  }

  async findPendingLogs(): Promise<ReminderLogsType[]> {
    return this.prismaService.reminderLogs.findMany({
      where: { status: StatusReminder.PENDING },
      include: {
        reminder: {
          include: {
            assignedRole: { select: { id: true } },
            createdBy: { select: { id: true, name: true } },
          },
        },
        completeBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: { scheduled_at: 'asc' },
    })
  }

  async findTodayLogs(): Promise<ReminderLogsType[]> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    return this.prismaService.reminderLogs.findMany({
      where: {
        scheduled_at: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        reminder: true,
        completeBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: { scheduled_at: 'asc' },
    })
  }

  async markAsCompleted(id: number, completedById: number): Promise<ReminderLogsType> {
    return this.prismaService.reminderLogs.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completed_at: new Date(),
        completedById,
      },
    })
  }

  async markAsMissed(id: number): Promise<ReminderLogsType> {
    return this.prismaService.reminderLogs.update({
      where: { id },
      data: {
        status: 'MISSED',
      },
    })
  }
}
