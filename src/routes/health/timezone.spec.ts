import { SYSTEM_TIME_ZONE } from '@/shared/config/timezone'

/**
 * Ticket #04: timezone nghiệp vụ phải là hằng số của hệ thống, không phụ thuộc máy/container.
 * Báo cáo cắt ngày theo giờ VN; nếu process chạy UTC thì doanh thu chốt sai ngày mà không ai thấy.
 */
describe('timezone nghiệp vụ', () => {
  it('đặt TZ = Asia/Ho_Chi_Minh trước mọi module', () => {
    expect(SYSTEM_TIME_ZONE).toBe('Asia/Ho_Chi_Minh')
    expect(new Date('2026-03-02T17:00:00.000Z').getDate()).toBe(3) // 00:00 ngày 3 giờ VN
  })
})
