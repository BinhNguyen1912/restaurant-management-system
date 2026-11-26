import { OrdersService } from '@/routes/orders/orders.service'

/**
 * ADMIN phải ĐỌC được dữ liệu của **mọi chi nhánh**; nhân viên chỉ chi nhánh mình.
 *
 * Lỗi thật: đường đọc dùng `resolveBranchId` — resolver của đường GHI, luôn trả đúng 1 chi nhánh
 * và fallback "chi nhánh active đầu tiên". ADMIN có `branchId = null` nên chỉ thấy chi nhánh 1,
 * trong khi báo cáo/tổng quan thấy cả 3 → nhìn như mất dữ liệu.
 */
function makeService(actorUser: { branchId: number | null }) {
  const calls: { listBranchId?: number | undefined } = {}

  const repo = {
    list: jest.fn(async (query: { branchId?: number }) => {
      calls.listBranchId = query.branchId
      return { data: [], totalItems: 0 }
    }),
    getById: jest.fn(async (_id: number, branchId?: number) => {
      calls.listBranchId = branchId
      return { id: 1 }
    }),
  }
  const prisma = {
    user: { findUnique: async () => actorUser },
    branch: { findFirst: async () => ({ id: 1 }) },
  }
  const service = new OrdersService(repo as any, {} as any, prisma as any)
  return { service, calls }
}

describe('OrdersService — phạm vi chi nhánh khi ĐỌC', () => {
  it('ADMIN: không lọc chi nhánh (undefined = mọi chi nhánh)', async () => {
    const { service, calls } = makeService({ branchId: null })

    await service.list({} as any, { userId: 1, roleName: 'ADMIN' })

    expect(calls.listBranchId).toBeUndefined()
  })

  it('STAFF: chỉ chi nhánh của mình', async () => {
    const { service, calls } = makeService({ branchId: 4 })

    await service.list({} as any, { userId: 2, roleName: 'STAFF' })

    expect(calls.listBranchId).toBe(4)
  })

  it('STAFF chưa gán chi nhánh: bị từ chối thay vì lặng lẽ xem chi nhánh 1', async () => {
    const { service } = makeService({ branchId: null })

    await expect(service.list({} as any, { userId: 3, roleName: 'STAFF' })).rejects.toThrow(
      'Error.BranchNotAssigned',
    )
  })
})
