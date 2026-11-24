import { NotFoundException } from '@nestjs/common'
import { resolveBranchId, resolveBranchIdByGuest } from './branch.resolver'
import { OrdersService } from '@/routes/orders/orders.service'
import { roleName } from '@/shared/constants/role.constant'

/**
 * Ticket 16 (P0-1b): scope chi nhanh.
 *
 * Loi goc: token GUEST mang `userId = Guest.id`, nhung `resolveBranchId` lai tra bang `User`
 * theo id do -> co the khop sang mot nhan vien cua chi nhanh KHAC va tra nham chi nhanh.
 * Chi lo ra khi co >= 2 chi nhanh, nen phai co test voi 2 chi nhanh.
 */
type FakePrisma = {
  user: { findUnique: (args: any) => Promise<any> }
  guest: { findUnique: (args: any) => Promise<any> }
  branch: { findFirst: (args: any) => Promise<any> }
}

function makePrisma(): FakePrisma {
  return {
    // User #7 thuoc chi nhanh 2
    user: { findUnique: async ({ where }: any) => (where.id === 7 ? { branchId: 2 } : null) },
    // Guest #7 (trung id voi User #7!) dang ngoi ban thuoc chi nhanh 1
    guest: {
      findUnique: async ({ where }: any) =>
        where.id === 7 ? { tableNode: { branchId: 1 } } : where.id === 8 ? { tableNode: null } : null,
    },
    branch: { findFirst: async () => ({ id: 1 }) },
  }
}

describe('resolveBranchId', () => {
  it('token nhan vien -> chi nhanh cua User.branchId', async () => {
    const prisma = makePrisma()
    await expect(resolveBranchId(prisma as any, { userId: 7, roleName: roleName.STAFF })).resolves.toBe(2)
  })

  it('token GUEST trung id voi mot User -> lay chi nhanh cua BAN, khong tra nham bang User', async () => {
    const prisma = makePrisma()
    // Guest #7 va User #7 cung id: neu tra bang User se ra chi nhanh 2 (sai)
    await expect(resolveBranchId(prisma as any, { userId: 7, roleName: roleName.GUEST })).resolves.toBe(1)
  })

  it('khong co userId -> chi nhanh active dau tien', async () => {
    const prisma = makePrisma()
    await expect(resolveBranchId(prisma as any, {})).resolves.toBe(1)
  })
})

describe('resolveBranchIdByGuest', () => {
  it('lay chi nhanh tu ban khach dang ngoi', async () => {
    await expect(resolveBranchIdByGuest(makePrisma() as any, 7)).resolves.toBe(1)
  })

  it('khach khong ton tai -> loi nghiep vu, khong doan bua chi nhanh', async () => {
    await expect(resolveBranchIdByGuest(makePrisma() as any, 999)).rejects.toThrow(/Không tìm thấy khách/)
  })
})

describe('OrdersService.getById', () => {
  function makeService(orderBranchId: number, actorBranchId: number) {
    const repo = {
      getById: jest.fn(async (orderId: number, branchId?: number) =>
        orderId === 500 && branchId === orderBranchId ? { id: 500, branchId } : null,
      ),
    }
    const prisma = {
      user: { findUnique: async ({ where }: any) => (where.id === 7 ? { branchId: actorBranchId } : null) },
      branch: { findFirst: async () => ({ id: actorBranchId }) },
    }
    const service = new OrdersService(repo as any, {} as any, prisma as any)
    return { service, repo }
  }

  it('nhan vien chi nhanh 1 khong doc duoc don cua chi nhanh 2 (404, khong lo du lieu)', async () => {
    const { service, repo } = makeService(2, 1)
    await expect(service.getById(500, { userId: 7, roleName: roleName.STAFF })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    // Van phai truyen branchId xuong repo thi moi loc duoc o tang DB
    expect(repo.getById).toHaveBeenCalledWith(500, 1)
  })

  it('doc duoc don cua dung chi nhanh minh', async () => {
    const { service } = makeService(2, 2)
    await expect(service.getById(500, { userId: 7, roleName: roleName.STAFF })).resolves.toMatchObject({ id: 500 })
  })
})
