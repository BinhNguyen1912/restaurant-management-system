import { reservationBodySchema } from './reservation.model'

// So tien coc chi duoc server tinh. Neu client gui duoc depositAmount thi so do se di vao
// Payment.amount, so VNPay thu va but toan quyet toan coc -> ba so lech nhau.
const baseBody = {
  customerName: 'Khach coc',
  customerPhone: '0900000000',
  tableNodeId: 1,
  guestCount: 2,
  reservationTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
  note: null,
  hasPreOrder: true,
  preOrderItems: [{ skuId: 1, quantity: 1 }],
  depositPercent: 50,
}

describe('reservationBodySchema - tien coc', () => {
  it('bo han depositAmount client gui len', () => {
    const parsed = reservationBodySchema.safeParse({ ...baseBody, depositAmount: 1_000 })

    expect(parsed.success).toBe(true)
    expect(parsed.success && 'depositAmount' in parsed.data).toBe(false)
  })

  it('tu choi khi dat coc ma thieu depositPercent', () => {
    const { depositPercent: _omit, ...withoutPercent } = baseBody
    const parsed = reservationBodySchema.safeParse(withoutPercent)

    expect(parsed.success).toBe(false)
  })

  it('tu choi muc coc ngoai 30/50/70/100', () => {
    const parsed = reservationBodySchema.safeParse({ ...baseBody, depositPercent: 45 })

    expect(parsed.success).toBe(false)
  })

  it('tu choi depositPercent khi khong dat mon truoc', () => {
    const parsed = reservationBodySchema.safeParse({ ...baseBody, hasPreOrder: false, preOrderItems: [] })

    expect(parsed.success).toBe(false)
  })

  it('cho qua khi dat mon truoc voi muc coc hop le', () => {
    const parsed = reservationBodySchema.safeParse(baseBody)

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.depositPercent).toBe(50)
  })
})
