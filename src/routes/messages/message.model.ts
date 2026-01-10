import { guestSchema } from '@/shared/models/shared-guest.model'
import { MessageSchema } from '@/shared/models/shared-message'
import { tableNodeSchema } from '@/shared/models/shared-tableNode.model'
import { UserSchema } from '@/shared/models/shared-user.model'
import { z } from 'zod'

export const sendGuestMessageSchema = z.object({
  content: z.string().min(1, { message: 'Content is required' }).max(1000, { message: 'Message too long' }),
  guestId: z.number().int().positive(),
})

export const sendUserMessageSchema = z.object({
  content: z.string().min(1, { message: 'Content is required' }).max(1000, { message: 'Message too long' }),
  toUserId: z.number().int().positive(),
  senderId: z.number().int().positive(),
})

export const markAsReadSchema = z.object({
  messageIds: z.array(z.number().int().positive()),
})

export const sendAdminToGuestMessageSchema = z.object({
  content: z.string().min(1, { message: 'Content is required' }).max(1000, { message: 'Message too long' }),
  guestId: z.number().int().positive(),
})

// User info cho tin nhắn (pick từ UserSchema)
const UserInfoSchema = UserSchema.pick({
  id: true,
  name: true,
  email: true,
  avatar: true,
})

// Guest với TableNode (extends từ guestSchema)
const GuestWithTableNodeSchema = guestSchema.extend({
  tableNode: tableNodeSchema.nullable(),
})

// Message response schema với relations (extends từ MessageSchema)
export const MessageWithRelationsSchema = MessageSchema.extend({
  fromGuest: GuestWithTableNodeSchema.nullable(),
  fromUser: UserInfoSchema.nullable(),
  toUser: UserInfoSchema.nullable(),
})

export const ConversationResponseSchema = MessageWithRelationsSchema.array()

const LastMessageSchema = z.object({
  content: z.string(),
  createdAt: z.date(),
})

export const ActiveGuestSchema = GuestWithTableNodeSchema.extend({
  unreadCount: z.number(),
  lastMessage: LastMessageSchema.nullable(),
})

export const GuestWithMessagesSchema = GuestWithTableNodeSchema.extend({
  unreadCount: z.number(),
  lastMessage: LastMessageSchema.extend({
    fromGuestId: z.number().nullable(),
    fromUserId: z.number().nullable(),
  }).nullable(),
})

// Array schemas
export const ActiveGuestListSchema = ActiveGuestSchema.array()
export const GuestWithMessagesListSchema = GuestWithMessagesSchema.array()

export type SendGuestMessageType = z.infer<typeof sendGuestMessageSchema>
export type SendUserMessageType = z.infer<typeof sendUserMessageSchema>
export type MarkAsReadType = z.infer<typeof markAsReadSchema>
export type SendAdminToGuestMessageType = z.infer<typeof sendAdminToGuestMessageSchema>
export type MessageWithRelationsType = z.infer<typeof MessageWithRelationsSchema>
export type ConversationResponseType = z.infer<typeof ConversationResponseSchema>
export type ActiveGuestType = z.infer<typeof ActiveGuestSchema>
export type GuestWithMessagesType = z.infer<typeof GuestWithMessagesSchema>
