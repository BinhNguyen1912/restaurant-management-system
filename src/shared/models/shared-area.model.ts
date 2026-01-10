import z from 'zod'

export const AreaSchema = z.object({
  id: z.number(),
  name: z.string(),
  isActive: z.boolean().default(false),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type AreaType = z.infer<typeof AreaSchema>
