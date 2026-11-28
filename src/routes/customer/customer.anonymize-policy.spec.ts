import {
  ANONYMIZED_NAME,
  ANONYMIZED_RESERVATION_PHONE,
  anonymizedPhone,
  isRetentionExpired,
  retentionCutoff,
} from './customer.anonymize-policy'

/** Ngày cố định để test không phụ thuộc lúc chạy. */
const NOW = new Date('2026-11-28T00:00:00.000Z')

describe('retentionCutoff', () => {
  it('lùi đúng số tháng', () => {
    expect(retentionCutoff(NOW, 12).toISOString()).toBe('2025-11-28T00:00:00.000Z')
    expect(retentionCutoff(NOW, 1).toISOString()).toBe('2026-10-28T00:00:00.000Z')
  })

  it('kẹp về ngày cuối tháng khi ngày đó không tồn tại (không tràn sang tháng sau)', () => {
    // 31/3 lùi 1 tháng: không có 31/2 ⇒ 28/2, KHÔNG phải 3/3
    expect(retentionCutoff(new Date('2026-03-31T10:00:00.000Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z')
    // năm nhuận vẫn tôn trọng ngày thật của tháng
    expect(retentionCutoff(new Date('2024-03-31T10:00:00.000Z'), 1).toISOString()).toBe('2024-02-29T10:00:00.000Z')
  })
})

describe('isRetentionExpired', () => {
  const monthsAgo = (months: number) => {
    const date = new Date(NOW.getTime())
    date.setUTCMonth(date.getUTCMonth() - months)
    return date
  }

  it('chưa đủ thời hạn thì giữ nguyên', () => {
    expect(
      isRetentionExpired({
        lastActivityAt: monthsAgo(11),
        openOrders: 0,
        now: NOW,
        retentionMonths: 12,
      }),
    ).toBe(false)
  })

  it('quá thời hạn thì ẩn danh được', () => {
    expect(
      isRetentionExpired({
        lastActivityAt: monthsAgo(13),
        openOrders: 0,
        now: NOW,
        retentionMonths: 12,
      }),
    ).toBe(true)
  })

  it('đúng mốc thì chưa ẩn danh (biên là "trước mốc", không phải "tới mốc")', () => {
    expect(
      isRetentionExpired({
        lastActivityAt: retentionCutoff(NOW, 12),
        openOrders: 0,
        now: NOW,
        retentionMonths: 12,
      }),
    ).toBe(false)
  })

  it('còn đơn chưa thu tiền thì KHÔNG ẩn danh, dù đã quá hạn', () => {
    expect(
      isRetentionExpired({
        lastActivityAt: monthsAgo(60),
        openOrders: 1,
        now: NOW,
        retentionMonths: 12,
      }),
    ).toBe(false)
  })

  it('thời hạn vô nghĩa (0, âm, NaN) thì không xoá gì — cấu hình sai không thành lệnh xoá', () => {
    for (const retentionMonths of [0, -12, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        isRetentionExpired({
          lastActivityAt: monthsAgo(120),
          openOrders: 0,
          now: NOW,
          retentionMonths,
        }),
      ).toBe(false)
    }
  })
})

describe('giá trị thay thế khi ẩn danh', () => {
  it('SĐT thay thế là duy nhất theo hồ sơ và không thể bị chuẩn hoá thành SĐT thật', () => {
    expect(anonymizedPhone(7)).toBe('anonymized:7')
    expect(anonymizedPhone(7)).not.toBe(anonymizedPhone(8))
    expect(anonymizedPhone(7)).not.toMatch(/^0\d+$/)
  })

  it('tên và SĐT của lượt đặt bàn không còn manh mối nào của khách', () => {
    expect(ANONYMIZED_NAME).toBe('Khách đã ẩn danh')
    expect(ANONYMIZED_RESERVATION_PHONE).toBe('anonymized')
  })
})
