import { ReportsService } from './reports.service'
import { resolveRange } from './revenue-summary'

/**
 * Regression (audit trước prod): `ensureProjection` chỉ kiểm "kỳ có ít nhất 1 dòng projection là
 * xong". Với kỳ CHƯA ĐÓNG (có ngày hôm nay), dòng đầu tiên của ngày được tính lúc 10:00 và mọi
 * lần đọc sau trong ngày trả số cũ ⇒ dashboard/báo cáo doanh thu đứng yên tới 01:05 hôm sau.
 */
describe('ReportsService.ensureProjection', () => {
  const actor = { userId: 1, roleName: 'ADMIN' }

  const makeService = (rows: { updatedAt: Date }[]) => {
    const repo = { summaries: jest.fn().mockResolvedValue(rows) }
    const prisma = {
      user: { findUnique: jest.fn() },
      branch: { findFirst: jest.fn(), findMany: jest.fn() },
    }
    const service = new ReportsService(repo as any, prisma as any)
    const recompute = jest.spyOn(service as any, 'recompute').mockResolvedValue(undefined)
    return { service, recompute, repo }
  }

  const today = () => resolveRange(undefined, undefined).from

  it('kỳ đã đóng (ngày trong quá khứ): dùng lại projection, không tính lại', async () => {
    const { service, recompute } = makeService([{ updatedAt: new Date() }])

    await (service as any).ensureProjection({ fromDate: '2020-01-01', toDate: '2020-01-02' }, actor)

    expect(recompute).not.toHaveBeenCalled()
  })

  it('kỳ đang mở + số cũ hơn TTL: phải tính lại', async () => {
    const stale = new Date(Date.now() - 5 * 60 * 1000)
    const { service, recompute } = makeService([{ updatedAt: stale }])

    await (service as any).ensureProjection({ fromDate: today(), toDate: today() }, actor)

    expect(recompute).toHaveBeenCalledTimes(1)
  })

  it('kỳ đang mở + vừa tính xong: dùng lại để không quét sổ mỗi request', async () => {
    const { service, recompute } = makeService([{ updatedAt: new Date() }])

    await (service as any).ensureProjection({ fromDate: today(), toDate: today() }, actor)

    expect(recompute).not.toHaveBeenCalled()
  })

  it('kỳ đang mở + chưa có dòng nào: phải tính', async () => {
    const { service, recompute } = makeService([])

    await (service as any).ensureProjection({ fromDate: today(), toDate: today() }, actor)

    expect(recompute).toHaveBeenCalledTimes(1)
  })
})
