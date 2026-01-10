import { StatusReminder } from '@/shared/constants/reminder.constant'
import { dateSchema, nullableDateSchema } from '@/shared/models/shared-reminder.model'
import z from 'zod'

export const ReminderLogsSchema = z.object({
  id: z.number().int().positive().optional(),
  reminder_id: z.number().int().positive(),
  scheduled_at: dateSchema,
  completed_at: nullableDateSchema.optional(),
  status: z.enum([StatusReminder.PENDING, StatusReminder.COMPLETED, StatusReminder.MISSED]),
  completedById: z.number().int().positive().nullable().optional(),
  createdAt: dateSchema.optional(),
  updatedAt: dateSchema.optional(),
})
export type ReminderLogsType = z.infer<typeof ReminderLogsSchema>
