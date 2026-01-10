import { LayoutStatus } from '@/shared/constants/table.constant'
import z from 'zod'

export const tableLayoutSchema = z.object({
  id: z.number(),
  name: z.string(),
  areaId: z.number(),
  status: z.enum([LayoutStatus.ACTIVE, LayoutStatus.ARCHIVED, LayoutStatus.DRAFT]),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type TableLayout = z.infer<typeof tableLayoutSchema>
