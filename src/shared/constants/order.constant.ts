export const OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  READY: 'READY',
  PAID: 'PAID',
} as const
export type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus]

export const TypeToOrderStatus = {
  ONLINE: 'ONLINE',
  AT_TABLE: 'AT_TABLE',
  RESERVATION: 'RESERVATION',
} as const
export type TypeToOrderStatusType = (typeof TypeToOrderStatus)[keyof typeof TypeToOrderStatus]

export const PaymentStatus = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  PENDING: 'PENDING',
} as const
export type PaymentStatusType = (typeof PaymentStatus)[keyof typeof PaymentStatus]
