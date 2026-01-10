import { CreateReminderType, UpdateReminderType } from '@/routes/reminders/reminders.model'
import { RepeatModeType } from '@/shared/constants/reminder.constant'
import { ReminderType } from '@/shared/models/shared-reminder.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class RemindersRepo {
  constructor(private readonly prismaService: PrismaService) {}
  async create({
    createReminderType,
    createdById,
  }: {
    createReminderType: CreateReminderType
    createdById: number
  }): Promise<ReminderType> {
    console.log('createReminderType', createReminderType)

    const assignedRoleIds = Array.isArray(createReminderType.assigned_role) ? createReminderType.assigned_role : []

    // Kết hợp scheduled_date (chỉ ngày) với time_to_remind (giờ) để tạo datetime đầy đủ
    let scheduledDateTime: Date | null = null
    if (createReminderType.scheduled_date) {
      const dateOnly = new Date(createReminderType.scheduled_date)
      console.log('dateOnly', dateOnly)

      // Parse date string (YYYY-MM-DD) nếu là string
      let year: number, month: number, day: number
      if (dateOnly instanceof Date && !isNaN(dateOnly.getTime())) {
        year = dateOnly.getFullYear()
        month = dateOnly.getMonth()
        day = dateOnly.getDate()
      } else {
        // Fallback: parse từ string
        const dateStr = String(createReminderType.scheduled_date).split('T')[0]
        ;[year, month, day] = dateStr.split('-').map(Number)
        month = month - 1 // month is 0-indexed
      }

      const [hours, minutes] = createReminderType.time_to_remind.split(':').map(Number)
      // Tạo date với local timezone (PostgreSQL sẽ tự convert sang UTC khi lưu)
      scheduledDateTime = new Date(year, month, day, hours, minutes, 0, 0)

      console.log(` [create] Creating scheduled_date: ${year}-${month + 1}-${day} ${hours}:${minutes}:00`)
      console.log(` [create] Scheduled datetime (local): ${scheduledDateTime.toISOString()}`)
    }

    const result = await this.prismaService.reminders.create({
      data: {
        title: createReminderType.title,
        time_to_remind: createReminderType.time_to_remind,
        scheduled_date: scheduledDateTime,
        repeat_mode: createReminderType.repeat_mode,
        repeat_days: createReminderType.repeat_days || [],
        is_active: createReminderType.is_active ?? true,
        description: createReminderType.description || null,
        createdById,
        assignedRole: {
          connect: assignedRoleIds.map((id) => ({ id })),
        },
      } as any,
      include: {
        assignedRole: {
          select: { id: true },
        },
      } as any,
    })

    return {
      ...result,
      scheduled_date: (result as any).scheduled_date || null,
      assigned_role: (result as any).assignedRole?.map((role: { id: number }) => role.id) || [],
      assignedRole: undefined,
    } as any
  }
  async update({
    reminderId,
    updateReminderType,
    updatedById,
  }: {
    updateReminderType: UpdateReminderType
    reminderId: number
    updatedById: number
  }): Promise<ReminderType> {
    const updateData: any = {
      updatedById,
    }

    // Cập nhật các field khác
    if (updateReminderType.title !== undefined) updateData.title = updateReminderType.title
    if (updateReminderType.time_to_remind !== undefined) updateData.time_to_remind = updateReminderType.time_to_remind

    // Kết hợp scheduled_date (chỉ ngày) với time_to_remind (giờ) để tạo datetime đầy đủ
    if (updateReminderType.scheduled_date !== undefined) {
      if (updateReminderType.scheduled_date) {
        const dateOnly = new Date(updateReminderType.scheduled_date)
        const timeToRemind = updateReminderType.time_to_remind || updateData.time_to_remind
        if (timeToRemind) {
          const [hours, minutes] = timeToRemind.split(':').map(Number)
          updateData.scheduled_date = new Date(
            dateOnly.getFullYear(),
            dateOnly.getMonth(),
            dateOnly.getDate(),
            hours,
            minutes,
            0,
          )
        } else {
          updateData.scheduled_date = null
        }
      } else {
        updateData.scheduled_date = null
      }
    }

    if (updateReminderType.repeat_mode !== undefined) updateData.repeat_mode = updateReminderType.repeat_mode
    if (updateReminderType.repeat_days !== undefined) updateData.repeat_days = updateReminderType.repeat_days
    if (updateReminderType.is_active !== undefined) updateData.is_active = updateReminderType.is_active
    if (updateReminderType.description !== undefined) updateData.description = updateReminderType.description

    // Cập nhật assigned roles nếu có
    if (updateReminderType.assigned_role !== undefined) {
      const assignedRoleIds = Array.isArray(updateReminderType.assigned_role) ? updateReminderType.assigned_role : []
      updateData.assignedRole = {
        set: assignedRoleIds.map((id) => ({ id })),
      }
    }

    const result = await this.prismaService.reminders.update({
      where: { id: reminderId, deletedAt: null },
      data: updateData,
      include: {
        assignedRole: {
          select: { id: true },
        },
      } as any,
    })

    return {
      ...result,
      scheduled_date: (result as any).scheduled_date || null,
      assigned_role: (result as any).assignedRole?.map((role: { id: number }) => role.id) || [],
      assignedRole: undefined,
    } as any
  }

  async findById(id: number): Promise<ReminderType | null> {
    const result = await this.prismaService.reminders.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        assignedRole: {
          select: {
            id: true,
            name: true,
            description: true,
            isActive: true,
          },
          where: {
            deletedAt: null,
          },
        },
        log: {
          orderBy: { scheduled_at: 'desc' },
          take: 10,
        },
      } as any,
    })
    if (!result) return null

    return {
      ...result,
      scheduled_date: (result as any).scheduled_date || null,
      assigned_role: (result as any).assignedRole?.map((role: { id: number }) => role.id) || [],
      assignedRole:
        (result as any).assignedRole?.map((role: any) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          isActive: role.isActive,
        })) || [],
    } as any
  }
  async findAllActive(): Promise<ReminderType[]> {
    const results = await this.prismaService.reminders.findMany({
      where: {
        is_active: true,
        deletedAt: null,
      },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
        assignedRole: {
          select: { id: true },
        },
      } as any,
      orderBy: { createdAt: 'asc' },
    })

    return results.map((result) => ({
      ...result,
      scheduled_date: (result as any).scheduled_date || null,
      assigned_role: (result as any).assignedRole?.map((role: { id: number }) => role.id) || [],
      assignedRole: undefined,
    })) as any[]
  }
  async findByRole(assigned_role: number): Promise<ReminderType[]> {
    const results = await this.prismaService.reminders.findMany({
      where: {
        assignedRole: {
          some: {
            id: assigned_role,
          },
        },
        is_active: true,
        deletedAt: null,
      } as any,
      include: {
        assignedRole: {
          select: { id: true },
        },
      } as any,
      orderBy: { time_to_remind: 'asc' },
    })

    return results.map((result) => ({
      ...result,
      scheduled_date: (result as any).scheduled_date || null,
      assigned_role: (result as any).assignedRole?.map((role: { id: number }) => role.id) || [],
      assignedRole: undefined,
    })) as any[]
  }
  async softDelete(id: number, deletedById: number): Promise<ReminderType> {
    const result = await this.prismaService.reminders.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById,
        is_active: false,
      },
      include: {
        assignedRole: {
          select: { id: true },
        },
      } as any,
    })

    return {
      ...result,
      scheduled_date: (result as any).scheduled_date || null,
      assigned_role: (result as any).assignedRole?.map((role: { id: number }) => role.id) || [],
      assignedRole: undefined,
    } as any
  }

  async findByRepeatMode(repeat_mode: RepeatModeType): Promise<ReminderType[]> {
    const results = await this.prismaService.reminders.findMany({
      where: {
        repeat_mode,
        is_active: true,
        deletedAt: null,
      },
      include: {
        assignedRole: {
          select: { id: true },
        },
      } as any,
    })

    return results.map((result) => ({
      ...result,
      scheduled_date: (result as any).scheduled_date || null,
      assigned_role: (result as any).assignedRole?.map((role: { id: number }) => role.id) || [],
      assignedRole: undefined,
    })) as any[]
  }

  async findDueReminders(currentTime: string, currentDay: number): Promise<ReminderType[]> {
    const now = new Date()
    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const currentDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())

    // Debug: Log current time and day
    // console.log(
    //   `🔍 [findDueReminders] Current time: ${currentTime}, Current day: ${currentDay} (${currentDay === 0 ? 'Sunday' : currentDay === 1 ? 'Monday' : currentDay === 2 ? 'Tuesday' : currentDay === 3 ? 'Wednesday' : currentDay === 4 ? 'Thursday' : currentDay === 5 ? 'Friday' : 'Saturday'})`,
    // )
    // console.log(`🔍 [findDueReminders] Current datetime (local): ${now.toISOString()}`)
    // console.log(`🔍 [findDueReminders] Current datetime (for comparison): ${currentDateTime.toISOString()}`)

    // Debug: Check total active reminders
    const totalActive = await this.prismaService.reminders.count({
      where: {
        is_active: true,
        deletedAt: null,
      },
    })
    // console.log(`📊 [findDueReminders] Total active reminders: ${totalActive}`)

    // Debug: List all active reminders
    const allActive = await this.prismaService.reminders.findMany({
      where: {
        is_active: true,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        time_to_remind: true,
        scheduled_date: true,
        repeat_mode: true,
      } as any,
    })
    // console.log(`📋 [findDueReminders] All active reminders:`)
    allActive.forEach((r) => {
      const scheduledDate = (r as any).scheduled_date
      const scheduledStr = scheduledDate
        ? new Date(scheduledDate).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
        : 'null'
      // console.log(
      //   `  - ID ${r.id}: "${r.title}" | Time: ${r.time_to_remind} | Scheduled: ${scheduledStr} | Repeat: ${r.repeat_mode}`,
      // )
    })

    const results = await this.prismaService.reminders.findMany({
      where: {
        is_active: true,
        deletedAt: null,
        OR: [
          // Nếu có scheduled_date, check ngày giờ cụ thể
          // So sánh với UTC time để match với database (PostgreSQL lưu UTC)
          {
            scheduled_date: {
              gte: new Date(currentDateTime.getTime() - 60000), // Trong vòng 1 phút trước
              lte: new Date(currentDateTime.getTime() + 60000), // Trong vòng 1 phút sau
            },
          } as any,
          // Nếu không có scheduled_date, dùng logic cũ với time_to_remind
          {
            AND: [
              { time_to_remind: currentTime },
              { scheduled_date: null } as any,
              {
                OR: [
                  { repeat_mode: RepeatModeType.DAILY },
                  { repeat_mode: RepeatModeType.WEEKLY, repeat_days: { has: currentDay } },
                  {
                    repeat_mode: RepeatModeType.MONTHLY,
                    createdAt: {
                      lte: new Date(new Date().setDate(1)), // First day of current month
                    },
                  },
                  {
                    repeat_mode: RepeatModeType.ONCE,
                    createdAt: {
                      gte: new Date(new Date().setHours(0, 0, 0, 0)),
                      lt: new Date(new Date().setHours(23, 59, 59, 999)),
                    },
                  },
                ],
              },
            ],
          },
        ],
      } as any,
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
        assignedRole: {
          select: { id: true },
        },
      } as any,
    })

    // console.log(`🔍 [findDueReminders] Found ${results.length} reminders matching conditions`)
    if (results.length > 0) {
      results.forEach((r) => {
        console.log(
          `  - Reminder ID: ${r.id}, Title: ${r.title}, Time: ${r.time_to_remind}, Scheduled: ${(r as any).scheduled_date || 'null'}, Repeat: ${r.repeat_mode}`,
        )
      })
    }

    return results.map((result) => ({
      ...result,
      scheduled_date: (result as any).scheduled_date || null,
      assigned_role: (result as any).assignedRole?.map((role: { id: number }) => role.id) || [],
      assignedRole: undefined,
    })) as any[]
  }
}
