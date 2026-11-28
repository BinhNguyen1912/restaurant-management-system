import {
  DEFAULT_PRUNE_LIMIT,
  isUsableLimit,
  isUsableRetentionMonths,
  MAX_PRUNE_LIMIT,
  planPrune,
  RETENTION_LOG_TABLES,
} from '@/shared/service/log-retention-policy'

/**
 * Dọn nhật ký theo thời hạn lưu — phần THUẦN (quyết định xoá gì).
 *
 * Ba nhóm điều kiện khoá ở đây vì sai một cái là mất bằng chứng không lấy lại được:
 *  (a) tham số vô nghĩa ⇒ KHÔNG lập kế hoạch, không có giá trị mặc định thay thế;
 *  (b) mốc tháng tính đúng ở các ngày cuối tháng / năm nhuận;
 *  (c) trần mỗi lần chạy có thật và có cận trên.
 */
const NOW = new Date('2026-11-28T00:00:00.000Z')

describe('planPrune', () => {
  it('lùi đúng số tháng', () => {
    const plan = planPrune({ now: NOW, retentionMonths: 12 })
    expect(plan?.cutoff.toISOString()).toBe('2025-11-28T00:00:00.000Z')
  })

  it('31/3 lùi một tháng ra 28/2, không phải 3/3', () => {
    const plan = planPrune({ now: new Date('2026-03-31T00:00:00.000Z'), retentionMonths: 1 })
    expect(plan?.cutoff.toISOString()).toBe('2026-02-28T00:00:00.000Z')
  })

  it('29/2 năm nhuận lùi 12 tháng ra 28/2 năm thường', () => {
    const plan = planPrune({ now: new Date('2028-02-29T00:00:00.000Z'), retentionMonths: 12 })
    expect(plan?.cutoff.toISOString()).toBe('2027-02-28T00:00:00.000Z')
  })

  it('thời hạn vô nghĩa thì KHÔNG có kế hoạch (không tự chọn con số thay thế)', () => {
    for (const retentionMonths of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(planPrune({ now: NOW, retentionMonths })).toBeNull()
    }
  })

  it('trần mỗi lần chạy: mặc định khi không truyền, kẹp khi xin quá cận trên', () => {
    expect(planPrune({ now: NOW, retentionMonths: 12 })?.limit).toBe(DEFAULT_PRUNE_LIMIT)
    expect(planPrune({ now: NOW, retentionMonths: 12, limit: 100 })?.limit).toBe(100)
    expect(planPrune({ now: NOW, retentionMonths: 12, limit: 10_000_000 })?.limit).toBe(MAX_PRUNE_LIMIT)
  })

  it('trần vô nghĩa thì KHÔNG có kế hoạch', () => {
    for (const limit of [0, -5, 1.5, Number.NaN]) {
      expect(planPrune({ now: NOW, retentionMonths: 12, limit })).toBeNull()
    }
  })

  it('đụng cả hai bảng nhật ký, không chỉ bảng vừa thêm', () => {
    expect(planPrune({ now: NOW, retentionMonths: 12 })?.tables).toEqual(['AccessLog', 'LoginAttempt'])
    expect(RETENTION_LOG_TABLES).toHaveLength(2)
  })
})

describe('isUsableLimit / isUsableRetentionMonths', () => {
  it('nhận số dương, từ chối phần còn lại', () => {
    expect(isUsableLimit(1)).toBe(true)
    expect(isUsableLimit(0)).toBe(false)
    expect(isUsableLimit(2.5)).toBe(false)
    expect(isUsableRetentionMonths(0.5)).toBe(true)
    expect(isUsableRetentionMonths(0)).toBe(false)
    expect(isUsableRetentionMonths(Number.NaN)).toBe(false)
  })
})
