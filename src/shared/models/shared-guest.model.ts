import { roleName } from '@/shared/constants/role.constant'
import z from 'zod'

export const guestSchema = z.object({
  id: z.number(),
  name: z.string().min(2).max(50),
  tableNodeId: z.number(),
  refreshToken: z.string().nullable(),
  refreshTokenExpiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
  deletedById: z.number().nullable(),
  updatedById: z.number().nullable(),
  createdById: z.number().nullable(),
})
export const guestLoginSchema = guestSchema
  .pick({
    name: true,
    tableNodeId: true,
  })
  .extend({
    token: z.string(),
  })

export const guestLoginResSchema = z.object({
  guest: guestSchema
    .extend({
      role: z.enum([roleName.GUEST]).default(roleName.GUEST),
      tableName: z.string(),
    })
    .omit({
      refreshToken: true,
      refreshTokenExpiresAt: true,
    }),
  accessToken: z.string(),
  refreshToken: z.string(),
})
export const CreateGuestSchema = guestSchema.pick({
  name: true,
  tableNodeId: true,
})
export type GuestType = z.infer<typeof guestSchema>
export type GuestLoginType = z.infer<typeof guestLoginSchema>
export type CreateGuestType = z.infer<typeof CreateGuestSchema>
export type GuestLoginResType = z.infer<typeof guestLoginResSchema>
