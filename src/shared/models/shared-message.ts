import z from 'zod'

export const MessageSchema = z.object({
  id: z.number(),
  fromUserId: z.number().nullable(),
  toUserId: z.number().nullable(),
  content: z.string(),
  readAt: z.date().nullable(),
  updatedAt: z.date(),
  createdAt: z.date(),
  fromGuestId: z.number().nullable(),
})
export type MessageType = z.infer<typeof MessageSchema>
