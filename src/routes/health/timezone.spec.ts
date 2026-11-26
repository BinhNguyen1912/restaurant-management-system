import { SYSTEM_TIME_ZONE } from '@/shared/config/timezone'
import { formatInTimeZone } from 'date-fns-tz'

/**
 * Ticket #04: timezone nghiệp vụ phải là hằng số của hệ thống, không phụ thuộc máy/container.
 * Báo cáo cắt ngày theo giờ VN; nếu process chạy UTC thì doanh thu chốt sai ngày mà không ai thấy.
 */
describe('timezone nghiệp vụ', () => {
  it('múi giờ hệ thống là Asia/Ho_Chi_Minh', () => {
    expect(SYSTEM_TIME_ZONE).toBe('Asia/Ho_Chi_Minh')
  })

  /**
   * Cắt ngày phải dùng `formatInTimeZone` với múi giờ TƯỜNG MINH — đây là thứ hệ thống thực sự
   * dùng để chốt doanh thu theo ngày.
   *
   * KHÔNG assert `new Date(...).getDate()`: Node đọc `TZ` một lần lúc khởi động (Node 20 trên CI
   * cache khác Node 22 trên máy dev), nên gán `process.env.TZ` trong module không đảm bảo `Date`
   * đổi theo. Test dựa vào side-effect đó sẽ đỏ/xanh tuỳ phiên bản Node — và tệ hơn, nó không
   * kiểm tra đúng thứ nghiệp vụ cần.
   */
  it('00:00 giờ VN ngày 3/3 thuộc ngày 3, không phải ngày 2', () => {
    expect(formatInTimeZone(new Date('2026-03-02T17:00:00.000Z'), SYSTEM_TIME_ZONE, 'yyyy-MM-dd')).toBe(
      '2026-03-03',
    )
    // 23:30 giờ VN vẫn phải thuộc đúng ngày đó (ca đêm không bị đẩy sang hôm sau)
    expect(formatInTimeZone(new Date('2026-03-03T16:30:00.000Z'), SYSTEM_TIME_ZONE, 'yyyy-MM-dd')).toBe(
      '2026-03-03',
    )
  })
})
