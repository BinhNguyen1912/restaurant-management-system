import { Prisma } from '@prisma/client'
import { OrdersRepo } from '@/routes/orders/orders.repo'
import { OrderStatus, PaymentStatus } from '@/shared/constants/order.constant'

/**
 * Đơn đặt bàn có cọc: tiền cọc đã thu là NỢ với khách, không phải doanh thu, và ORDER.paymentId
 * đang trỏ vào đúng bản ghi cọc đó (status = SUCCESS).
 *
 * Lỗi thật trước bản sửa: đường thu tiền đối chiếu Payment.amount với grandTotal của CẢ hoá đơn
 * (nên đơn có cọc luôn bị từ chối), rồi ghi "Nợ CASH = grandTotal" trong khi cọc cũng đã vào két —
 * tiền mặt và doanh thu bị đếm hai lần. Nay phần còn lại đi qua một Payment RIÊNG (orderId) và
 * bút toán chỉ ghi "Nợ CASH = grandTotal − cọc" + "Nợ DEPOSIT_LIABILITY = cọc".
 */
jest.mock('@/shared/service/branch.resolver', () => ({
  resolveBranchIdByGuest: jest.fn(async () => 1),
}))

type OrderFixture = {
  id: number
  paymentId: number
  branchId: number
  grandTotal: number
  depositAmount: number | null
  depositPaymentStatus: string
  depositPaymentAmount: number
}

function makeOrder(fixture: OrderFixture) {
  return {
    id: fixture.id,
    paymentId: fixture.paymentId,
    branchId: fixture.branchId,
    status: OrderStatus.PENDING,
    subtotal: new Prisma.Decimal(fixture.grandTotal),
    discountTotal: new Prisma.Decimal(0),
    serviceChargeAmount: new Prisma.Decimal(0),
    taxTotal: new Prisma.Decimal(0),
    tipAmount: new Prisma.Decimal(0),
    grandTotal: new Prisma.Decimal(fixture.grandTotal),
    payment: {
      id: fixture.paymentId,
      amount: new Prisma.Decimal(fixture.depositPaymentAmount),
      status: fixture.depositPaymentStatus,
      method: 'CASH',
    },
    reservation:
      fixture.depositAmount === null ? null : { depositAmount: new Prisma.Decimal(fixture.depositAmount) },
  }
}

function makeRepo(fixtures: OrderFixture[]) {
  const orders = fixtures.map(makeOrder)
  const createdPayments: { amount: Prisma.Decimal; orderId?: number }[] = []

  const tx = {
    order: { updateMany: jest.fn(async () => ({ count: orders.length })) },
    payment: {
      updateMany: jest.fn(async (args: { where: { id: { in: number[] } } }) => ({
        count: args.where.id.in.length,
      })),
      create: jest.fn(async (args: { data: { amount: Prisma.Decimal; orderId?: number } }) => {
        createdPayments.push(args.data)
        return { id: 501, ...args.data }
      }),
    },
  }

  let orderFindManyCalls = 0
  const prismaService = {
    $transaction: async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx),
    order: {
      findMany: jest.fn(async () => {
        orderFindManyCalls += 1
        return orderFindManyCalls === 1 ? orders : []
      }),
    },
    socket: { findFirst: jest.fn(async () => null) },
  }

  const ledgerPosting = { postEntry: jest.fn(async () => ({ entryId: 1 })) }
  const cogsService = { postOrderCogs: jest.fn(async () => undefined) }

  const repo = new OrdersRepo(prismaService as never, ledgerPosting as never, {} as never, cogsService as never)
  return { repo, tx, ledgerPosting, createdPayments }
}

function postedLines(ledgerPosting: { postEntry: jest.Mock }) {
  const [payload] = ledgerPosting.postEntry.mock.calls[0] as [
    { lines: { accountCode: string; direction: string; amount: Prisma.Decimal }[] },
  ]
  return payload.lines
}

const sumOf = (lines: { direction: string; amount: Prisma.Decimal }[], direction: string) =>
  lines
    .filter((line) => line.direction === direction)
    .reduce((acc, line) => acc.plus(line.amount), new Prisma.Decimal(0))

describe('OrdersRepo.payOrdersByGuest — đơn đã đặt cọc', () => {
  it('cọc đã thu: thu phần còn lại bằng Payment riêng, không lật lại Payment của cọc', async () => {
    const { repo, tx, createdPayments } = makeRepo([
      {
        id: 7,
        paymentId: 90,
        branchId: 1,
        grandTotal: 1_000_000,
        depositAmount: 300_000,
        depositPaymentStatus: PaymentStatus.SUCCESS,
        depositPaymentAmount: 300_000,
      },
    ])

    await repo.payOrdersByGuest({ guestId: 5, updatedById: 3 })

    // Payment của cọc đã SUCCESS: đường updateMany(PENDING -> SUCCESS) không được chạm vào nó.
    expect(tx.payment.updateMany).not.toHaveBeenCalled()
    expect(createdPayments).toHaveLength(1)
    expect(createdPayments[0].amount.toString()).toBe('700000')
    expect(createdPayments[0].orderId).toBe(7)
  })

  it('bút toán chỉ ghi Nợ CASH = grandTotal − cọc, cọc chuyển từ nợ sang doanh thu', async () => {
    const { repo, ledgerPosting } = makeRepo([
      {
        id: 7,
        paymentId: 90,
        branchId: 1,
        grandTotal: 1_000_000,
        depositAmount: 300_000,
        depositPaymentStatus: PaymentStatus.SUCCESS,
        depositPaymentAmount: 300_000,
      },
    ])

    await repo.payOrdersByGuest({ guestId: 5, updatedById: 3 })

    expect(ledgerPosting.postEntry).toHaveBeenCalledTimes(1)
    const lines = postedLines(ledgerPosting)
    const cash = lines.find((line) => line.accountCode === 'CASH' && line.direction === 'DEBIT')
    const deposit = lines.find((line) => line.accountCode === 'DEPOSIT_LIABILITY' && line.direction === 'DEBIT')
    expect(cash?.amount.toString()).toBe('700000')
    expect(deposit?.amount.toString()).toBe('300000')
    expect(sumOf(lines, 'DEBIT').equals(sumOf(lines, 'CREDIT'))).toBe(true)
    expect(sumOf(lines, 'DEBIT').toString()).toBe('1000000')
  })

  it('bút toán bám vào Payment mới để bấm lại lần hai không ghi sổ hai lần', async () => {
    const { repo, ledgerPosting } = makeRepo([
      {
        id: 7,
        paymentId: 90,
        branchId: 1,
        grandTotal: 1_000_000,
        depositAmount: 300_000,
        depositPaymentStatus: PaymentStatus.SUCCESS,
        depositPaymentAmount: 300_000,
      },
    ])

    await repo.payOrdersByGuest({ guestId: 5, updatedById: 3 })

    const [payload] = ledgerPosting.postEntry.mock.calls[0] as unknown as [
      { refId: number; idempotencyKey: string },
    ]
    expect(payload.idempotencyKey).toBe('cash:deposit-settle:501')
    expect(payload.refId).toBe(501)
  })

  it('cọc phủ hết hoá đơn: không tạo Payment, toàn bộ hoá đơn tất toán từ cọc', async () => {
    const { repo, ledgerPosting, createdPayments, tx } = makeRepo([
      {
        id: 8,
        paymentId: 91,
        branchId: 1,
        grandTotal: 500_000,
        depositAmount: 800_000,
        depositPaymentStatus: PaymentStatus.SUCCESS,
        depositPaymentAmount: 800_000,
      },
    ])

    await repo.payOrdersByGuest({ guestId: 5, updatedById: 3 })

    expect(createdPayments).toHaveLength(0)
    expect(tx.payment.updateMany).not.toHaveBeenCalled()
    const lines = postedLines(ledgerPosting)
    expect(lines.some((line) => line.accountCode === 'CASH')).toBe(false)
    expect(sumOf(lines, 'DEBIT').toString()).toBe('500000')
    expect(sumOf(lines, 'DEBIT').equals(sumOf(lines, 'CREDIT'))).toBe(true)
  })

  it('đặt cọc nhưng CHƯA thu: cả hoá đơn vẫn thu qua Payment cũ, không trừ khoản tiền chưa vào két', async () => {
    const { repo, tx, ledgerPosting, createdPayments } = makeRepo([
      {
        id: 9,
        paymentId: 92,
        branchId: 1,
        grandTotal: 400_000,
        depositAmount: 100_000,
        depositPaymentStatus: PaymentStatus.PENDING,
        depositPaymentAmount: 400_000,
      },
    ])

    await repo.payOrdersByGuest({ guestId: 5, updatedById: 3 })

    expect(tx.payment.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.payment.updateMany.mock.calls[0][0].where.id.in).toEqual([92])
    expect(createdPayments).toHaveLength(0)
    const lines = postedLines(ledgerPosting)
    expect(lines.some((line) => line.accountCode === 'DEPOSIT_LIABILITY')).toBe(false)
    const cash = lines.find((line) => line.accountCode === 'CASH' && line.direction === 'DEBIT')
    expect(cash?.amount.toString()).toBe('400000')
  })

  it('đơn không đặt cọc: đường cũ giữ nguyên', async () => {
    const { repo, tx, createdPayments } = makeRepo([
      {
        id: 10,
        paymentId: 93,
        branchId: 1,
        grandTotal: 250_000,
        depositAmount: null,
        depositPaymentStatus: PaymentStatus.PENDING,
        depositPaymentAmount: 250_000,
      },
    ])

    await repo.payOrdersByGuest({ guestId: 5, updatedById: 3 })

    expect(tx.payment.updateMany.mock.calls[0][0].where.id.in).toEqual([93])
    expect(createdPayments).toHaveLength(0)
  })
})

