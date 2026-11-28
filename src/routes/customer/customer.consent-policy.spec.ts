import {
  CONSENT_POLICY_VERSION,
  currentConsents,
  type ConsentRow,
} from '@/routes/customer/customer.consent-policy'

const row = (purpose: string, granted: boolean, createdAt: string, version = CONSENT_POLICY_VERSION): ConsentRow => ({
  purpose,
  granted,
  version,
  createdAt: new Date(createdAt),
})

describe('currentConsents', () => {
  it('chưa từng hỏi khách thì mọi mục đích đều CHƯA đồng ý (fail closed)', () => {
    const states = currentConsents([])
    expect(states).toHaveLength(2)
    expect(states.every((state) => state.granted === false && state.active === false)).toBe(true)
    expect(states.every((state) => state.at === null && state.version === null && state.stale === false)).toBe(true)
  })

  it('lần ghi MỚI NHẤT thắng — khách rút đồng ý thì hết hiệu lực', () => {
    const rows = [
      row('MARKETING', false, '2026-11-02T10:00:00.000Z'),
      row('MARKETING', true, '2026-11-01T10:00:00.000Z'),
    ]
    const marketing = currentConsents(rows).find((state) => state.purpose === 'MARKETING')!
    expect(marketing).toMatchObject({ granted: false, active: false, at: new Date('2026-11-02T10:00:00.000Z') })
  })

  it('đồng ý nhận ưu đãi không kéo theo mục đích phục vụ và ngược lại', () => {
    const states = currentConsents([row('MARKETING', true, '2026-11-01T10:00:00.000Z')])
    expect(states.find((state) => state.purpose === 'MARKETING')?.active).toBe(true)
    expect(states.find((state) => state.purpose === 'SERVICE')?.active).toBe(false)
  })

  it('đồng ý theo phiên bản chính sách CŨ thì hết hiệu lực, phải hỏi lại', () => {
    const states = currentConsents([row('MARKETING', true, '2026-11-01T10:00:00.000Z', '2025-01')])
    const marketing = states.find((state) => state.purpose === 'MARKETING')!
    expect(marketing).toMatchObject({ granted: true, stale: true, active: false })
  })
})

