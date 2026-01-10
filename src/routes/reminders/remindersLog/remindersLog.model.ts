import { ReminderLogsSchema } from '@/shared/models/shared-reminderLogs.model'
import z from 'zod'

export const CreateReminderLogSchema = ReminderLogsSchema.pick({
  id: true,
  completedById: true,
  completed_at: true,
  reminder_id: true,
  scheduled_at: true,
  status: true,
})
export const UpdateReminderLogSchema = ReminderLogsSchema.partial().omit({
  id: true,
  reminder_id: true,
})
export type CreateReminderLogType = z.infer<typeof CreateReminderLogSchema>
export type UpdateReminderLogType = z.infer<typeof UpdateReminderLogSchema>
