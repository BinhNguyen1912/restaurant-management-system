import { Prisma } from '@prisma/client'
import { isPaymentAmountMatched, isSameAmount, parseVnpayAmount, recordWebhookOnce } from './payment-hardening'

/**
 * Hardening Payment (ADR 0001 D7): webhook phai doi chieu so tien va phai idempotent.
 */
describe('parseVnpayAmount', () => {
  it('VNPay gui so tien nhan 100, doi ve VND', () => {
    expect(parseVnpayAmount('12000000')).toBe(120000)
  })

  it('so le tien (khong nguyen) la khong hop le', () => {
    expect(parseVnpayAmount('999')).toBeNull()
  })

  it('thieu hoac rac thi tra null', () => {
    expect(parseVnpayAmount(undefined)).toBeNull()
    expect(parseVnpayAmount(null)).toBeNull()
    expect(parseVnpayAmount('')).toBeNull()
    expect(parseVnpayAmount('abc')).toBeNull()
  })
})

describe('isPaymentAmountMatched', () => {
  it('khop so tien trong Payment', () => {
    expect(isPaymentAmountMatched(new Prisma.Decimal(120000), '12000000')).toBe(true)
  })

  it('tra nhieu hon thi tu choi', () => {
    expect(isPaymentAmountMatched(new Prisma.Decimal(120000), '13000000')).toBe(false)
  })

  it('tra it hon thi tu choi', () => {
    expect(isPaymentAmountMatched(new Prisma.Decimal(120000), '11000000')).toBe(false)
  })

  it('so tien co duoi .00 van so dung (khong sai so float)', () => {
    expect(isPaymentAmountMatched(new Prisma.Decimal('120000.00'), '12000000')).toBe(true)
  })

  it('VND chi nhan so nguyen: vnp_Amount le 1 dong thi tu choi', () => {
    expect(isPaymentAmountMatched(new Prisma.Decimal('33.33'), '3333')).toBe(false)
  })

  it('vnp_Amount rac thi tu choi', () => {
    expect(isPaymentAmountMatched(new Prisma.Decimal(120000), 'xyz')).toBe(false)
  })
})

describe('isSameAmount', () => {
  it('bang nhau du khac kieu (number, string, Decimal)', () => {
    expect(isSameAmount(new Prisma.Decimal('120000.00'), 120000)).toBe(true)
    expect(isSameAmount(120000, '120000')).toBe(true)
  })

  it('lech 1 dong la false (khong dung so sanh float)', () => {
    expect(isSameAmount(new Prisma.Decimal(120000), new Prisma.Decimal(120000.01))).toBe(false)
  })
})

describe('recordWebhookOnce', () => {
  const makeTx = (impl: () => Promise<unknown>) => ({ webhookEvent: { create: impl } })

  it('lan dau tien: ghi nhan va tra true', async () => {
    const tx = makeTx(async () => ({ id: 1 }))
    await expect(recordWebhookOnce(tx, { provider: 'vnpay', externalId: 'TXN1' })).resolves.toBe(true)
  })

  it('replay cung externalId: tra false (khong tao hieu ung lan 2)', async () => {
    const tx = makeTx(async () => {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    })
    await expect(recordWebhookOnce(tx, { provider: 'vnpay', externalId: 'TXN1' })).resolves.toBe(false)
  })

  it('loi khac P2002 thi phai nem ra, khong nuot', async () => {
    const tx = makeTx(async () => {
      throw Object.assign(new Error('DB down'), { code: 'P1001' })
    })
    await expect(recordWebhookOnce(tx, { provider: 'vnpay', externalId: 'TXN1' })).rejects.toThrow('DB down')
  })
})
