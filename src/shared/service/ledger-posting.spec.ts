import { Prisma } from '@prisma/client'
import { hashEntryInput, LedgerPostingService } from './ledger-posting.service'

/**
 * Seam: Prisma giả có trạng thái, mô phỏng đúng 3 bước của posting
 * (giữ chỗ eventKey -> ghi dòng -> DRAFT => POSTED).
 * Trọng tâm kiểm: bất biến Nợ = Có, idempotency, và "cùng key khác nội dung thì xung đột".
 */
type EntryRow = { id: number; idempotencyKey: string; requestHash: string; status: string }

const makeFakeDb = (options: { accounts?: { id: number; code: string; isActive?: boolean; currency?: string }[] } = {}) => {
  const entries: EntryRow[] = []
  const lines: any[] = []
  const calls: string[] = []
  let nextId = 1

  const accounts = (options.accounts ?? [
    { id: 1, code: 'CASH' },
    { id: 2, code: 'REVENUE_FOOD' },
    { id: 3, code: 'SERVICE_CHARGE' },
  ]).map((account) => ({ isActive: true, currency: 'VND', ...account }))

  const client = {
    ledgerAccount: {
      findMany: async (args: any) => {
        calls.push('account.findMany')
        return accounts.filter((account) => args.where.code.in.includes(account.code))
      },
    },
    ledgerEntry: {
      findUnique: async (args: any) => {
        calls.push('entry.findUnique')
        const row = entries.find((entry) => entry.idempotencyKey === args.where.idempotencyKey)
        return row ? { ...row } : null
      },
      createMany: async (args: any) => {
        calls.push('entry.createMany')
        const rows = Array.isArray(args.data) ? args.data : [args.data]
        let count = 0
        for (const row of rows) {
          if (entries.some((entry) => entry.idempotencyKey === row.idempotencyKey)) continue
          entries.push({
            id: nextId++,
            idempotencyKey: row.idempotencyKey,
            requestHash: row.requestHash,
            status: row.status ?? 'DRAFT',
          })
          count += 1
        }
        return { count }
      },
      updateMany: async (args: any) => {
        calls.push('entry.updateMany')
        const row = entries.find((entry) => entry.id === args.where.id && entry.status === args.where.status)
        if (!row) return { count: 0 }
        row.status = args.data.status
        return { count: 1 }
      },
    },
    ledgerLine: {
      createMany: async (args: any) => {
        calls.push('line.createMany')
        lines.push(...args.data)
        return { count: args.data.length }
      },
    },
  }

  const service = new LedgerPostingService({} as any)
  return { service, client: client as any, entries, lines, calls }
}

const baseInput = {
  branchId: 1,
  refType: 'ORDER_PAID_CASH' as const,
  refId: 23,
  idempotencyKey: 'cash:payment:23',
  memo: 'Đơn #23 - bàn 5',
  lines: [
    { accountCode: 'CASH', direction: 'DEBIT' as const, amount: 189000, paymentId: 23 },
    { accountCode: 'REVENUE_FOOD', direction: 'CREDIT' as const, amount: 180000, paymentId: 23 },
    { accountCode: 'SERVICE_CHARGE', direction: 'CREDIT' as const, amount: 9000, paymentId: 23 },
  ],
}

describe('LedgerPostingService.postEntry', () => {
  it('ghi đúng thứ tự: giữ chỗ eventKey -> ghi dòng -> chuyển POSTED', async () => {
    const { service, client, entries, lines, calls } = makeFakeDb()

    const result = await service.postEntry(baseInput, client)

    expect(result).toEqual({ id: 1, created: true })
    expect(calls).toEqual(['entry.findUnique', 'account.findMany', 'entry.createMany', 'entry.findUnique', 'line.createMany', 'entry.updateMany'])
    expect(entries[0].status).toBe('POSTED')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ accountId: 1, direction: 'DEBIT', paymentId: 23 })
  })

  it('bút toán lệch thì KHÔNG ghi gì cả', async () => {
    const { service, client, calls } = makeFakeDb()

    await expect(
      service.postEntry(
        {
          ...baseInput,
          lines: [
            { accountCode: 'CASH', direction: 'DEBIT', amount: 189000 },
            { accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount: 180000 },
          ],
        },
        client,
      ),
    ).rejects.toThrow(/không cân/)

    expect(calls).toHaveLength(0)
  })

  it('thiếu 2 dòng thì từ chối (bút toán 1 dòng vô nghĩa)', async () => {
    const { service, client } = makeFakeDb()

    await expect(
      service.postEntry({ ...baseInput, lines: [{ accountCode: 'CASH', direction: 'DEBIT', amount: 1000 }] }, client),
    ).rejects.toThrow(/2 dòng/)
  })

  it('tài khoản ngừng dùng hoặc sai tiền tệ thì từ chối', async () => {
    const { service, client } = makeFakeDb({
      accounts: [
        { id: 1, code: 'CASH', isActive: false },
        { id: 2, code: 'REVENUE_FOOD' },
      ],
    })

    await expect(
      service.postEntry(
        {
          ...baseInput,
          lines: [
            { accountCode: 'CASH', direction: 'DEBIT', amount: 1000 },
            { accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount: 1000 },
          ],
        },
        client,
      ),
    ).rejects.toThrow(/không dùng được/)
  })

  it('replay cùng key + cùng nội dung: không tạo bút toán thứ 2', async () => {
    const { service, client, entries } = makeFakeDb()

    const first = await service.postEntry(baseInput, client)
    const replay = await service.postEntry(baseInput, client)

    expect(first).toEqual({ id: 1, created: true })
    expect(replay).toEqual({ id: 1, created: false })
    expect(entries).toHaveLength(1)
  })

  it('cùng key nhưng số tiền khác: báo XUNG ĐỘT, không ghi đè', async () => {
    const { service, client, entries } = makeFakeDb()

    await service.postEntry(baseInput, client)

    await expect(
      service.postEntry(
        {
          ...baseInput,
          lines: [
            { accountCode: 'CASH', direction: 'DEBIT', amount: 100000 },
            { accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount: 100000 },
          ],
        },
        client,
      ),
    ).rejects.toThrow(/nội dung khác/)

    expect(entries).toHaveLength(1)
  })

  it('2 request song song: chỉ 1 bút toán, bên thua replay hoặc 409 (không ghi đôi)', async () => {
    const { service, client, entries, lines } = makeFakeDb()

    const results = await Promise.allSettled([service.postEntry(baseInput, client), service.postEntry(baseInput, client)])

    const created = results.filter((result) => result.status === 'fulfilled' && result.value.created)
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(entries).toHaveLength(1)
    expect(lines).toHaveLength(3)
    expect(created).toHaveLength(1)
    // bên thua hoặc replay (created:false) hoặc bị từ chối để retry — không bao giờ ghi thêm
    expect(created.length + rejected.length).toBe(2)
  })

  it('số tiền "1000" và "1000.00" cho cùng hash (không coi là xung đột)', () => {
    const a = hashEntryInput(baseInput)
    const b = hashEntryInput({
      ...baseInput,
      lines: baseInput.lines.map((line) => ({
        ...line,
        amount: new Prisma.Decimal(line.amount).toFixed(2),
      })),
    })

    expect(a).toBe(b)
  })

  it('đổi chi nhánh hoặc chứng từ thì hash phải đổi', () => {
    expect(hashEntryInput(baseInput)).not.toBe(hashEntryInput({ ...baseInput, branchId: 2 }))
    expect(hashEntryInput(baseInput)).not.toBe(hashEntryInput({ ...baseInput, refId: 24 }))
  })
})
