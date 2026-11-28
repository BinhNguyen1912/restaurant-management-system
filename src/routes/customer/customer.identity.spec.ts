import { buildCustomerUpsert, cleanCustomerName, normalizeCustomerPhone } from './customer.identity'

describe('normalizeCustomerPhone', () => {
  it('bo khoang trang, dau cham, gach ngang — cung mot nguoi thi cung mot khoa', () => {
    expect(normalizeCustomerPhone('0901 234 567')).toBe('0901234567')
    expect(normalizeCustomerPhone('0901.234.567')).toBe('0901234567')
    expect(normalizeCustomerPhone(' 0901-234-567 ')).toBe('0901234567')
  })

  it('doi dau so quoc te ve 0 de khong tao hai ho so cho cung mot khach', () => {
    expect(normalizeCustomerPhone('+84901234567')).toBe('0901234567')
    expect(normalizeCustomerPhone('84901234567')).toBe('0901234567')
    expect(normalizeCustomerPhone('0084901234567')).toBe('0901234567')
  })

  it('giu nguyen so 9-11 chu so (so ban, dau 02x cu)', () => {
    expect(normalizeCustomerPhone('0241234567')).toBe('0241234567')
    expect(normalizeCustomerPhone('912345678')).toBe('912345678')
  })

  it('tra null khi khong du tin cay: rong, khong co so, qua ngan, qua dai', () => {
    expect(normalizeCustomerPhone(null)).toBeNull()
    expect(normalizeCustomerPhone(undefined)).toBeNull()
    expect(normalizeCustomerPhone('')).toBeNull()
    expect(normalizeCustomerPhone('   ')).toBeNull()
    expect(normalizeCustomerPhone('khach quen')).toBeNull()
    expect(normalizeCustomerPhone('090')).toBeNull()
    expect(normalizeCustomerPhone('090123456789012')).toBeNull()
  })

  it('khong coi "84" o giua so la ma nuoc', () => {
    // 11 chu so bat dau bang 84 la dang quoc te; so 10 chu so co 84 o giua thi giu nguyen
    expect(normalizeCustomerPhone('0908412345')).toBe('0908412345')
  })
})

describe('cleanCustomerName', () => {
  it('cat khoang trang va coi chuoi rong la khong co ten', () => {
    expect(cleanCustomerName('  Nguyễn A ')).toBe('Nguyễn A')
    expect(cleanCustomerName('   ')).toBeNull()
    expect(cleanCustomerName(null)).toBeNull()
  })
})

describe('buildCustomerUpsert', () => {
  it('create luon co phone + name, thieu ten thi lay phone lam ten tam', () => {
    expect(buildCustomerUpsert({ phone: '0901234567' }).create).toEqual({
      phone: '0901234567',
      name: '0901234567',
      userId: null,
    })
  })

  it('update chi chua field co thong tin — dat ban khong nhap ten khong xoa ten cu', () => {
    expect(buildCustomerUpsert({ phone: '0901234567', name: '   ' })).toEqual({
      create: { phone: '0901234567', name: '0901234567', userId: null },
      update: {},
    })
    expect(buildCustomerUpsert({ phone: '0901234567', name: 'Nguyễn A' }).update).toEqual({ name: 'Nguyễn A' })
  })
})
