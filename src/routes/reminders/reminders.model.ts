import { RepeatModeType } from '@/shared/constants/reminder.constant'
import { RemindersSchema } from '@/shared/models/shared-reminder.model'
import z from 'zod'

export const CreateReminderSchema = RemindersSchema.pick({
  title: true,
  time_to_remind: true,
  scheduled_date: true,
  repeat_mode: true,
  repeat_days: true,
  is_active: true,
  assigned_role: true,
  description: true,
})
export const UpdateReminderSchema = CreateReminderSchema.partial()
export const ReminderQuerySchema = z.object({
  is_active: z.boolean().optional(),
  assigned_role: z.array(z.number().int().positive()).optional(),
  repeat_mode: z
    .enum([
      RepeatModeType.DAILY,
      RepeatModeType.WEEKLY,
      RepeatModeType.ONCE,
      RepeatModeType.MONTHLY,
      RepeatModeType.YEARLY,
      RepeatModeType.NONE,
    ])
    .optional(),
  date: z.string().date().optional(),
})

export const ReminderResSchema = RemindersSchema

export type CreateReminderType = z.infer<typeof CreateReminderSchema>
export type UpdateReminderType = z.infer<typeof UpdateReminderSchema>
export type ReminderQueryType = z.infer<typeof ReminderQuerySchema>
export type ReminderResType = z.infer<typeof ReminderResSchema>
