import { planAccessLog } from '@/interceptor/access-log-plan'

describe('planAccessLog — nhật ký truy cập ghi gì', () => {
  it('route một hồ sơ: lấy id từ params và đếm 1 bản ghi', () => {
    expect(planAccessLog({ route: 'GET /customers/:id', params: { id: '42' }, body: { data: { id: 42 } } })).toEqual({
      route: 'GET /customers/:id',
      customerId: 42,
      resultCount: 1,
    })
  })

  it('params.id dạng số (đã qua ParseIntPipe) vẫn đọc đúng', () => {
    expect(planAccessLog({ route: 'GET /customers/:id', params: { id: 7 }, body: { data: {} } }).customerId).toBe(7)
  })

  it('id không phải số nguyên dương thì KHÔNG gán bừa cho hồ sơ nào', () => {
    for (const id of ['abc', '42abc', '12.5', '0', '-3', '', undefined]) {
      expect(planAccessLog({ route: 'GET /customers', params: { id }, body: { data: [] } }).customerId).toBeNull()
    }
  })

  it('route danh sách: đếm số bản ghi trả về', () => {
    const body = { data: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    expect(planAccessLog({ route: 'GET /customers', body })).toEqual({
      route: 'GET /customers',
      customerId: null,
      resultCount: 3,
    })
  })

  it('danh sách rỗng vẫn là một lần đọc trả 0 kết quả', () => {
    // không ghi thì không phân biệt được "tra khách không có" với "không tra gì"
    expect(planAccessLog({ route: 'GET /customers', body: { data: [] } }).resultCount).toBe(0)
  })

  it('không có dữ liệu trả về thì resultCount là null, không phải 0', () => {
    expect(planAccessLog({ route: 'GET /customers/:id', params: { id: '5' }, body: null }).resultCount).toBeNull()
    expect(planAccessLog({ route: 'GET /customers/:id', params: { id: '5' }, body: {} }).resultCount).toBeNull()
  })
})
