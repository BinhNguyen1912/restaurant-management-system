import { ALLOWED_TRANSITIONS } from '@/shared/shared-repository/shared-orders.repo'
import { OrderStatus } from '@/shared/constants/order.constant'

/**
 * Regression (audit trước prod): trước đây chỉ chặn đích `PAID`/`COMPLETED`, nên
 * `CANCELLED → PREPARING` (đơn đã huỷ "sống lại", bếp nhận lại món đã huỷ) và `PENDING → READY`
 * (bỏ qua bếp) đều hợp lệ, còn `PAID → CANCELLED` thì huỷ được mà **không** sinh bút toán đảo.
 */
describe('ALLOWED_TRANSITIONS', () => {
  it('đơn đã HUỶ là trạng thái cuối, không có cạnh đi ra', () => {
    expect(ALLOWED_TRANSITIONS[OrderStatus.CANCELLED]).toEqual([])
  })

  it('không nhảy cóc qua bếp: PENDING không tới thẳng READY/COMPLETED', () => {
    expect(ALLOWED_TRANSITIONS[OrderStatus.PENDING]).not.toContain(OrderStatus.READY)
    expect(ALLOWED_TRANSITIONS[OrderStatus.PENDING]).not.toContain(OrderStatus.COMPLETED)
  })

  it('PAID chỉ được huỷ (qua luồng hoàn tiền), không quay lại trạng thái chế biến', () => {
    expect(ALLOWED_TRANSITIONS[OrderStatus.PAID]).toEqual([OrderStatus.CANCELLED])
  })

  it('mọi trạng thái đều có luật, không có trạng thái nào rơi vào undefined', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(ALLOWED_TRANSITIONS[status]).toBeDefined()
    }
  })
})
