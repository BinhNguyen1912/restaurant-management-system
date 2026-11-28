/**
 * Các loại bút toán **thu tiền thật** và tài khoản nhận tiền tương ứng.
 *
 * Một nguồn duy nhất cho cả 3 nơi: đối soát theo kỳ (`reconciliation.service`), phát hiện payment
 * chưa có bút toán (`ledger-entry.repo.paymentsWithoutEntry`) và kiểm tra toàn vẹn sổ. Trước đây
 * mỗi nơi hard-code `['ORDER_PAID_CASH','ORDER_PAID_VNPAY']`, nên bút toán **đặt cọc**
 * (`RESERVATION_DEPOSIT`, cũng `refId = paymentId`) bị coi là thiếu ⇒ ngày nào cũng báo lệch giả.
 */
export const RECEIVING_REF_TYPES = {
  ORDER_PAID_CASH: 'CASH',
  ORDER_PAID_VNPAY: 'VNPAY_CLEARING',
  RESERVATION_DEPOSIT: 'VNPAY_CLEARING',
} as const

export type ReceivingRefType = keyof typeof RECEIVING_REF_TYPES

export const RECEIVING_REF_TYPE_LIST = Object.keys(RECEIVING_REF_TYPES) as ReceivingRefType[]
