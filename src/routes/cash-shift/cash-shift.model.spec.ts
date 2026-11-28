import { CloseCashShiftSchema, CreateCashMovementSchema, OpenCashShiftSchema } from '@/routes/cash-shift/cash-shift.model'

/**
 * Regression (audit trước prod): `z.coerce.number()` biến `null`/`''` thành 0, nên đóng ca với ô
 * "tiền mặt thực đếm" không parse được vẫn được chấp nhận với 0đ ⇒ tự sinh bút toán thiếu quỹ
 * bằng toàn bộ tiền trong két.
 */
describe('CloseCashShiftSchema — tiền đếm két', () => {
  it('số tiền hợp lệ được làm tròn về đồng', () => {
    expect(CloseCashShiftSchema.parse({ countedCash: 1_000_000 }).countedCash).toBe(1_000_000)
    expect(CloseCashShiftSchema.parse({ countedCash: 99_999.6 }).countedCash).toBe(100_000)
  })

  it('null KHÔNG được coi là 0', () => {
    expect(() => CloseCashShiftSchema.parse({ countedCash: null })).toThrow()
  })

  it('chuỗi "1.000.000" bị từ chối thay vì thành 0 hay NaN', () => {
    expect(() => CloseCashShiftSchema.parse({ countedCash: '1.000.000' })).toThrow()
  })
})

describe('OpenCashShiftSchema — tiền lẻ đầu ca', () => {
  it('nhận số, từ chối null', () => {
    expect(OpenCashShiftSchema.parse({ openingFloat: 500_000 }).openingFloat).toBe(500_000)
    expect(() => OpenCashShiftSchema.parse({ openingFloat: null })).toThrow()
  })
})

describe('CreateCashMovementSchema — chứng từ', () => {
  const base = { type: 'OUT', reason: 'mua đá', amount: 50_000 }

  it('không có chứng từ vẫn hợp lệ (két có thể chi khi chưa kịp chụp)', () => {
    expect(CreateCashMovementSchema.parse(base).evidenceUrls).toEqual([])
  })

  it('nhận link https của ảnh và video', () => {
    const parsed = CreateCashMovementSchema.parse({
      ...base,
      evidenceUrls: ['https://res.cloudinary.com/a/image/upload/x.jpg', 'https://res.cloudinary.com/a/video/upload/y.mp4'],
    })
    expect(parsed.evidenceUrls).toHaveLength(2)
  })

  it('từ chối link http (không phải Cloudinary https)', () => {
    expect(() => CreateCashMovementSchema.parse({ ...base, evidenceUrls: ['http://localhost/a.jpg'] })).toThrow()
  })

  it('từ chối quá 5 chứng từ', () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://res.cloudinary.com/a/${i}.jpg`)
    expect(() => CreateCashMovementSchema.parse({ ...base, evidenceUrls: urls })).toThrow()
  })

  it('từ chối chuỗi không phải URL', () => {
    expect(() => CreateCashMovementSchema.parse({ ...base, evidenceUrls: ['anh-cua-toi.jpg'] })).toThrow()
  })
})
