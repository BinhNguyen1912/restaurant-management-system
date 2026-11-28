import { hashRefreshToken } from '@/shared/service/token-hash'

describe('hashRefreshToken', () => {
  it('cung mot token -> cung mot hash (deterministic)', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.payload.signature'
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token))
  })

  it('la sha256 hex: dung 64 ky tu hex thuong', () => {
    expect(hashRefreshToken('bat-ky')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('token khac nhau -> hash khac nhau', () => {
    expect(hashRefreshToken('token-a')).not.toBe(hashRefreshToken('token-b'))
  })

  it('khop voi sha256 chuan cua chuoi rong (khong tu them salt/don vi)', () => {
    expect(hashRefreshToken('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})
