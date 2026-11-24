import { isIntentUsable, PAYMENT_INTENT_TTL_MS } from './payment-intent'

/**
 * Regression (review vòng 2): URL thanh toán cũ (intent đã VOID) vẫn tạo hiệu ứng —
 * nhánh thất bại hạ Payment về FAILED và huỷ reservation, dù khách còn 1 URL mới đang sống.
 */
describe('isIntentUsable', () => {
  const now = new Date('2026-11-23T10:00:00.000Z')

  it('intent PENDING còn mới thì dùng được', () => {
    expect(isIntentUsable({ status: 'PENDING', createdAt: new Date(now.getTime() - 60_000) }, now)).toBe(true)
  })

  it('intent đã VOID (bị URL mới thay thế) thì không được tạo hiệu ứng', () => {
    expect(isIntentUsable({ status: 'VOID', createdAt: now }, now)).toBe(false)
  })

  it('intent đã PROCESSED thì không chạy lại', () => {
    expect(isIntentUsable({ status: 'PROCESSED', createdAt: now }, now)).toBe(false)
  })

  it('intent quá hạn thì từ chối', () => {
    const old = new Date(now.getTime() - PAYMENT_INTENT_TTL_MS - 1000)
    expect(isIntentUsable({ status: 'PENDING', createdAt: old }, now)).toBe(false)
  })

  it('không có intent (URL cũ) thì không chặn', () => {
    expect(isIntentUsable(null, now)).toBe(true)
    expect(isIntentUsable(undefined, now)).toBe(true)
  })

  it('createdAt hỏng thì từ chối (fail closed)', () => {
    expect(isIntentUsable({ status: 'PENDING', createdAt: 'khong-phai-ngay' }, now)).toBe(false)
  })
})
