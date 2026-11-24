import { CreateCashMovementSchema } from '@/routes/cash-shift/cash-shift.model'

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
