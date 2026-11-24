import { resolveResourceType } from '@/shared/service/cloudinary.service'

/**
 * Chứng từ tiền mặt nhận cả ảnh và video. Cloudinary mặc định `resource_type=image`
 * nên video phải khai báo 'video', nếu không upload hỏng.
 */
describe('resolveResourceType', () => {
  it('video mp4/mov/webm -> video', () => {
    expect(resolveResourceType('video/mp4')).toBe('video')
    expect(resolveResourceType('video/quicktime')).toBe('video')
    expect(resolveResourceType('video/webm')).toBe('video')
  })

  it('ảnh -> image', () => {
    expect(resolveResourceType('image/jpeg')).toBe('image')
    expect(resolveResourceType('image/png')).toBe('image')
    expect(resolveResourceType('image/heic')).toBe('image')
  })
})
