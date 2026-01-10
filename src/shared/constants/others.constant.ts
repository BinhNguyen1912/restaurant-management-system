import { e164 } from 'zod/v4/core/regexes.cjs'
import { TypeToOrderStatus } from './order.constant'

// export const UPLOAD_DIR = path.resolve('upload')
export const GetAllLanguages = 'all'

export const OrderBy = {
  Asc: 'asc',
  Desc: 'desc',
} as const
export const SortBy = {
  CreatedAt: 'createdAt',
  Sale: 'sale',
  Price: 'price',
} as const

export const prefixToOrderStatus = {
  [TypeToOrderStatus.AT_TABLE]: 'TAB',
  [TypeToOrderStatus.RESERVATION]: 'RSV',
  [TypeToOrderStatus.ONLINE]: 'ONL',
} as const
export type prefixToOrderStatusType = (typeof prefixToOrderStatus)[keyof typeof prefixToOrderStatus]

export const PREFIX_PAYMENT_CODE = 'DH'
export type OrderByType = (typeof OrderBy)[keyof typeof OrderBy]
export type SortByType = (typeof SortBy)[keyof typeof SortBy]

//WebSocket Rooms
export const ManagerRoom = 'MANAGER_ROOM' as const

//QUEUE
export const Inventory_Queue = 'inventory-queue' as const
export const REMINDER_QUEUE = 'reminder-queue' as const

//WebSocket Events
export const WS_EVENTS = {
  NEW_ORDER: 'new-order',
  LOW_STOCK_WARNING: 'low-stock-warning',
  NOT_ENOUGH_INGREDIENT: 'not-enough-ingredient',
  ORDER_STATUS_UPDATED: 'order-status-updated',
  PAYMENT_REQUEST: 'payment-request',
  CALL_STAFF: 'call-staff',
  PAYMENT_SUCCESS: 'payment-success',
  GUEST_MESSAGE: 'guest-message',
  GUEST_MESSAGE_TO_ADMIN: 'guest-message-to-admin',
  ADMIN_MESSAGE_TO_GUEST: 'admin-message-to-guest',
} as const

export const dayNames: string[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
