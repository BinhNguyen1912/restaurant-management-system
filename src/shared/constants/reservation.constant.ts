export const reservationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
  DEPOSITED: 'DEPOSITED',
} as const
export type reservationStatusType = (typeof reservationStatus)[keyof typeof reservationStatus]
