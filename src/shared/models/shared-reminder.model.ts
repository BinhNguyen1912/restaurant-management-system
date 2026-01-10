import { RepeatModeType } from '@/shared/constants/reminder.constant'
import z from 'zod'

export const RemindersSchema = z.object({
  id: z.number(),
  title: z.string().min(1).max(255),
  time_to_remind: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Thời gian nhắc nhở phải ở định dạng HH:MM',
  }),
  scheduled_date: z
    .union([z.date(), z.string(), z.coerce.date()])
    .nullable()
    .optional()
    .transform((val) => {
      console.log('VAL', val)

      if (!val) return null

      if (val instanceof Date) {
        return new Date(val.getFullYear(), val.getMonth(), val.getDate())
      }

      const dateStr = val.split('T')[0] // YYYY-MM-DD
      const [y, m, d] = dateStr.split('-').map(Number)

      const newDate = new Date(y, m - 1, d) // local timezone
      return newDate
    }),
  // Chỉ nhận ngày (YYYY-MM-DD), giờ sẽ lấy từ time_to_remind
  repeat_mode: z.enum([
    RepeatModeType.DAILY,
    RepeatModeType.WEEKLY,
    RepeatModeType.ONCE,
    RepeatModeType.MONTHLY,
    RepeatModeType.YEARLY,
    RepeatModeType.NONE,
  ]),
  repeat_days: z.array(z.number().int().min(0).max(6)).default([]),
  is_active: z.boolean().default(true),
  assigned_role: z.array(z.number().int().positive()),
  description: z.string().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  deletedAt: z.date().nullable().optional(),
  createdById: z.number().int().positive().nullable().optional(),
  updatedById: z.number().int().positive().nullable().optional(),
  deletedById: z.number().int().positive().nullable().optional(),
})

export const dateSchema = z.union([z.date(), z.string().datetime()])
export const nullableDateSchema = dateSchema.nullable()
export type ReminderType = z.infer<typeof RemindersSchema>
