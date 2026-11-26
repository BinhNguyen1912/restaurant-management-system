import { Prisma } from '@prisma/client'
import { CashShiftService } from '@/routes/cash-shift/cash-shift.service'
import { BadRequestException } from '@nestjs/common'
import { roleName } from '@/shared/constants/role.constant'

/**
 * Ticket P2-1: ca co 3 don tien mat + 1 khoan chi -> variance dung, va but toan lech ket
 * duoc ghi cung transaction voi viec dong ca.
 *
 * Repo/Prisma duoc gia lap de test dung nghiep vu (khong can DB).
 */
type Overrides = {
  unpaid?: number[]
  cashIn?: Prisma.Decimal
  movements?: { cashIn: Prisma.Decimal; cashOut: Prisma.Decimal }
}

function makeService(overrides: Overrides = {}) {
  const shift = {
    id: 7,
    branchId: 1,
    staffId: 3,
    status: 'OPEN',
    openedAt: new Date('2026-11-24T01:00:00Z'),
    closedAt: null,
    openingFloat: new Prisma.Decimal(500_000),
    countedCash: null,
    expectedCash: null,
    variance: null,
    cashIn: new Prisma.Decimal(0),
    cashOut: new Prisma.Decimal(0),
    note: null,
    ledgerEntryId: null,
    closedById: null,
    createdAt: new Date('2026-11-24T01:00:00Z'),
    updatedAt: new Date('2026-11-24T01:00:00Z'),
    movements: [],
  }

  const repo = {
    addMovement: jest.fn(async (_shiftId: number, _branchId: number, data: any) => ({
      id: 1,
      shiftId: 7,
      type: data.type,
      reason: data.reason,
      amount: new Prisma.Decimal(data.amount),
      evidenceUrls: data.evidenceUrls ?? [],
      createdById: data.createdById ?? null,
      createdAt: new Date(),
    })),
    findById: jest.fn(async () => shift),
    findOpenByBranch: jest.fn(async () => shift),
    findOpenByStaff: jest.fn(async () => null),
    findUnpaidCashOrderIds: jest.fn(async () => overrides.unpaid ?? []),
    sumCashPayments: jest.fn(
      async () => overrides.cashIn ?? new Prisma.Decimal(150_000).plus(200_000).plus(250_000),
    ),
    sumMovements: jest.fn(
      async () =>
        overrides.movements ?? { cashIn: new Prisma.Decimal(0), cashOut: new Prisma.Decimal(100_000) },
    ),
  }

  const stored: any = { ...shift }
  const tx = {
    cashShift: {
      updateMany: jest.fn(async ({ data }: any) => {
        Object.assign(stored, data)
        return { count: 1 }
      }),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(stored, data)
        return stored
      }),
      findUnique: jest.fn(async () => ({ ...stored })),
    },
  }
  const prisma = {
    $transaction: async (fn: any) => fn(tx),
    user: { findUnique: async () => ({ branchId: 1 }) },
    guest: { findUnique: async () => null },
    branch: { findFirst: async () => ({ id: 1 }) },
  }
  const ledgerPosting = { postEntry: jest.fn(async (_input: any, _tx?: any) => ({ id: 99, created: true })) }

  const service = new CashShiftService(repo as any, prisma as any, ledgerPosting as any)
  return { service, repo, ledgerPosting, tx, stored }
}

const staff = { userId: 3, roleName: roleName.STAFF }

describe('CashShiftService.close', () => {
  it('3 don tien mat (600k) + 1 khoan chi (100k), float 500k, dem 980k -> variance -20k + but toan thieu quy', async () => {
    const { service, ledgerPosting, stored } = makeService()

    const closed = await service.close(7, staff, { countedCash: 980_000 })

    // expected = 500k + 600k - 100k = 1.000k ; variance = 980k - 1.000k = -20k
    expect(stored.expectedCash.toFixed(2)).toBe('1000000.00')
    expect(stored.variance.toFixed(2)).toBe('-20000.00')
    expect((closed as any).variance).toBe(-20_000)

    expect(ledgerPosting.postEntry).toHaveBeenCalledTimes(1)
    const entry = ledgerPosting.postEntry.mock.calls[0][0]
    expect(entry.refType).toBe('CASH_VARIANCE')
    expect(entry.idempotencyKey).toBe('cash-shift:7:variance')
    expect(entry.lines).toEqual([
      { accountCode: 'CASH_SHORTAGE', direction: 'DEBIT', amount: expect.anything() },
      { accountCode: 'CASH', direction: 'CREDIT', amount: expect.anything() },
    ])
    expect(entry.lines[0].amount.toFixed(2)).toBe('20000.00')
    // Bút toán ghi trong cùng transaction rồi gắn vào ca
    expect(stored.ledgerEntryId).toBe(99)
  })

  it('dem thua -> Co CASH_OVERAGE', async () => {
    const { service, ledgerPosting } = makeService()
    await service.close(7, staff, { countedCash: 1_030_000 })
    const entry = ledgerPosting.postEntry.mock.calls[0][0]
    expect(entry.lines.map((line: any) => `${line.direction} ${line.accountCode}`)).toEqual([
      'DEBIT CASH',
      'CREDIT CASH_OVERAGE',
    ])
  })

  it('khop ket -> khong sinh but toan', async () => {
    const { service, ledgerPosting } = makeService()
    await service.close(7, staff, { countedCash: 1_000_000 })
    expect(ledgerPosting.postEntry).not.toHaveBeenCalled()
  })

  it('con don tien mat chua thu -> khong cho dong ca', async () => {
    const { service, repo, ledgerPosting } = makeService({ unpaid: [11, 12] })
    // lỗi nghiệp vụ 400 kèm danh sách đơn -> FE hiện được đơn nào cần thu tiền
    await expect(service.close(7, staff, { countedCash: 1_000_000 })).rejects.toBeInstanceOf(BadRequestException)
    expect(repo.findUnpaidCashOrderIds).toHaveBeenCalled()
    expect(ledgerPosting.postEntry).not.toHaveBeenCalled()
  })
})

describe('CashShiftService.addMovement — chứng từ', () => {
  it('lưu ảnh/video chứng từ của khoản chi', async () => {
    const { service, repo } = makeService()
    const urls = [
      'https://res.cloudinary.com/demo/image/upload/hoa-don.jpg',
      'https://res.cloudinary.com/demo/video/upload/bien-nhan.mp4',
    ]
    await service.addMovement(7, staff, {
      type: 'OUT',
      reason: 'mua đá',
      amount: 50_000,
      evidenceUrls: urls,
    })
    // tham số thứ 4 là transaction (movement + bút toán phải cùng một transaction)
    expect(repo.addMovement).toHaveBeenCalledWith(7, 1, expect.objectContaining({ evidenceUrls: urls }), expect.anything())
  })

  it('chi tay -> bút toán Nợ OTHER_EXPENSE / Có CASH (vào sổ cái)', async () => {
    const { service, ledgerPosting } = makeService()

    const result = (await service.addMovement(7, staff, {
      type: 'OUT',
      reason: 'mua đá',
      amount: 50_000,
      evidenceUrls: [],
    })) as any

    expect(ledgerPosting.postEntry).toHaveBeenCalledTimes(1)
    const entry = ledgerPosting.postEntry.mock.calls[0][0]
    expect(entry.refType).toBe('CASH_MOVEMENT')
    expect(entry.branchId).toBe(1)
    expect(entry.idempotencyKey).toBe('cash-movement:1')
    expect(entry.lines).toEqual([
      { accountCode: 'OTHER_EXPENSE', direction: 'DEBIT', amount: expect.anything() },
      { accountCode: 'CASH', direction: 'CREDIT', amount: expect.anything() },
    ])
    // trả về id bút toán để UI/đối soát biết khoản này đã ghi sổ
    expect(result.ledgerEntryId).toBe(99)
  })

  it('thu tay -> bút toán Nợ CASH / Có OTHER_INCOME', async () => {
    const { service, ledgerPosting } = makeService()

    await service.addMovement(7, staff, { type: 'IN', reason: 'thu khác', amount: 300_000, evidenceUrls: [] })

    const entry = ledgerPosting.postEntry.mock.calls[0][0]
    expect(entry.lines).toEqual([
      { accountCode: 'CASH', direction: 'DEBIT', amount: expect.anything() },
      { accountCode: 'OTHER_INCOME', direction: 'CREDIT', amount: expect.anything() },
    ])
  })
})
