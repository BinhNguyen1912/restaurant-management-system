import { AccessSubject } from '@prisma/client'
import { planAccessLog } from '@/interceptor/access-log-plan'
import { AccessLogMeta } from '@/shared/decorators/access-log.decorator'

const customerDetail: AccessLogMeta = { route: 'GET /customers/:id', subject: { type: AccessSubject.CUSTOMER, param: 'id' } }
const userDetail: AccessLogMeta = { route: 'GET /users/:userId', subject: { type: AccessSubject.USER, param: 'userId' } }
const customerList: AccessLogMeta = { route: 'GET /customers' }

describe('planAccessLog — nhật ký truy cập ghi gì', () => {
  it('route một hồ sơ: lấy id từ param đã khai và đếm 1 bản ghi', () => {
    expect(planAccessLog({ meta: customerDetail, params: { id: '42' }, body: { data: { id: 42 } } })).toEqual({
      route: 'GET /customers/:id',
      subjectType: 'CUSTOMER',
      subjectId: 42,
      resultCount: 1,
    })
  })

  it('param dạng số (đã qua ParseIntPipe) vẫn đọc đúng', () => {
    expect(planAccessLog({ meta: customerDetail, params: { id: 7 }, body: { data: {} } }).subjectId).toBe(7)
  })

  it('tên param do route khai, không phải luôn là "id"', () => {
    // route nhân viên dùng :userId — đọc nhầm `params.id` thì mọi dòng nhật ký của module users
    // sẽ không có chủ thể, và không ai phát hiện vì nó vẫn ghi được
    const plan = planAccessLog({ meta: userDetail, params: { userId: '11', id: '99' }, body: { data: {} } })
    expect(plan).toEqual({ route: 'GET /users/:userId', subjectType: 'USER', subjectId: 11, resultCount: 1 })
  })

  it('id không phải số nguyên dương thì KHÔNG gán bừa cho hồ sơ nào', () => {
    for (const id of ['abc', '42abc', '12.5', '0', '-3', '', undefined]) {
      const plan = planAccessLog({ meta: customerDetail, params: { id }, body: { data: [] } })
      // không nửa cặp: hoặc có đủ (type, id), hoặc không có cả hai
      expect(plan.subjectType).toBeNull()
      expect(plan.subjectId).toBeNull()
    }
  })

  it('route danh sách: không gắn chủ thể, đếm số bản ghi trả về', () => {
    const body = { data: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    expect(planAccessLog({ meta: customerList, body })).toEqual({
      route: 'GET /customers',
      subjectType: null,
      subjectId: null,
      resultCount: 3,
    })
  })

  it('danh sách rỗng vẫn là một lần đọc trả 0 kết quả', () => {
    // không ghi thì không phân biệt được "tra khách không có" với "không tra gì"
    expect(planAccessLog({ meta: customerList, body: { data: [] } }).resultCount).toBe(0)
  })

  it('không có dữ liệu trả về thì resultCount là null, không phải 0', () => {
    expect(planAccessLog({ meta: customerDetail, params: { id: '5' }, body: null }).resultCount).toBeNull()
  })

  it('handler trả đối tượng trần (không bọc `data`): route một chủ thể vẫn đếm 1', () => {
    // module users trả thẳng đối tượng; đọc mỗi `body.data` sẽ ra null ở đúng route cần truy nhất
    const plan = planAccessLog({ meta: userDetail, params: { userId: '11' }, body: { id: 11, email: 'a@b.c' } })
    expect(plan.resultCount).toBe(1)
  })

  it('route danh sách trả mảng trần vẫn đếm được', () => {
    expect(planAccessLog({ meta: customerList, body: [{ id: 1 }, { id: 2 }] }).resultCount).toBe(2)
  })
})
