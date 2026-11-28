import { InventoryProcessor } from '@/processors/inventory.processor'

/**
 * Test cho InventoryProcessor — nơi 3 lỗi thật đã lộ ra trong log chạy e2e:
 *
 *  1. `tx.ingredient.update` / `tx.order.update` ném P2025 khi bản ghi không còn, khiến job
 *     retry 3 lần rồi mới hoàn tác Redis — vừa ồn vừa chậm.
 *  2. Một ingredient bị xoá làm hỏng CẢ transaction ⇒ đơn không được đồng bộ tồn kho.
 *  3. Ghi đè `status: PENDING` vô tình làm đơn ĐÃ HUỶ sống lại.
 */
function makeFakes(options: { order?: { id: number; status: string } | null; missingIngredients?: number[] } = {}) {
  const calls = {
    reverted: [] as { ingredientId: number; quantity: number }[],
    stockWrites: [] as { id: number; stock: number }[],
    /** ghi theo delta (decrement) — đường ĐÚNG khi job có `deducted` */
    stockDeltas: [] as { id: number; delta: number }[],
    statusWrites: 0,
    lowStockEmits: 0,
  }

  const tx = {
    order: {
      findUnique: async () => options.order === undefined ? { id: 1, status: 'PENDING' } : options.order,
      update: async () => {
        calls.statusWrites += 1
        return {}
      },
      updateMany: async () => {
        calls.statusWrites += 1
        return { count: 1 }
      },
    },
    ingredient: {
      updateMany: async ({ where, data }: any) => {
        if ((options.missingIngredients ?? []).includes(where.id)) return { count: 0 }
        if (data.stock.decrement !== undefined) calls.stockDeltas.push({ id: where.id, delta: Number(data.stock.decrement) })
        else calls.stockWrites.push({ id: where.id, stock: Number(data.stock.set) })
        return { count: 1 }
      },
      update: async () => {
        throw new Error('P2025: dùng updateMany, không dùng update')
      },
      findUnique: async ({ where }: any) => ({ id: where.id, name: `NL ${where.id}`, unit: { name: 'kg' } }),
    },
  }

  const prisma = { $transaction: async (run: any) => run(tx) } as any
  const redisService = {
    luaScripts: new Map<string, string>([['revert-stock', 'script']]),
    runLuaScript: async (_script: string, deducted: any) => {
      calls.reverted.push(...deducted)
      return { success: true, updated: [] }
    },
  } as any
  const appGateway = { server: { to: () => ({ emit: () => (calls.lowStockEmits += 1) }) } } as any

  const processor = new InventoryProcessor(prisma, redisService, appGateway)
  return { processor, calls }
}

const job = (data: any, attemptsMade = 0, attempts = 3) =>
  ({ data, id: 'job-1', attemptsMade, opts: { attempts } }) as any

describe('InventoryProcessor', () => {
  it('đơn không còn: KHÔNG retry, hoàn tác Redis đúng một lần và không ném lỗi', async () => {
    const { processor, calls } = makeFakes({ order: null })

    await expect(
      processor.process(job({ orderId: 999, updatedIngredients: [], deducted: [{ ingredientId: 3, quantity: 2 }] })),
    ).resolves.toEqual({ success: false, skipped: 'ORDER_NOT_FOUND' })

    expect(calls.reverted).toEqual([{ ingredientId: 3, quantity: 2 }])
    expect(calls.stockWrites).toEqual([])
  })

  it('một nguyên liệu đã bị xoá: vẫn ghi các nguyên liệu còn lại, không hỏng cả transaction', async () => {
    const { processor, calls } = makeFakes({ missingIngredients: [7] })

    const result = await processor.process(
      job({
        orderId: 1,
        updatedIngredients: [
          { ingredientId: 7, newStock: 10 },
          { ingredientId: 8, newStock: 20 },
        ],
      }),
    )

    expect(result.success).toBe(true)
    expect(calls.stockWrites).toEqual([{ id: 8, stock: 20 }])
  })

  it('đơn đã HUỶ: chỉ đồng bộ tồn kho, KHÔNG ghi đè trạng thái về PENDING', async () => {
    const { processor, calls } = makeFakes({ order: { id: 1, status: 'CANCELLED' } })

    await processor.process(job({ orderId: 1, updatedIngredients: [{ ingredientId: 8, newStock: 5 }] }))

    // đây là lỗi cũ: ghi PENDING sẽ làm đơn đã huỷ sống lại
    expect(calls.statusWrites).toBe(0)
    expect(calls.stockWrites).toEqual([{ id: 8, stock: 5 }])
  })

  it('lỗi tạm thời (DB chết) ở lần chưa cuối: NÉM để BullMQ retry và CHƯA hoàn tác Redis', async () => {
    const { processor, calls } = makeFakes()
    ;(processor as any).prisma = {
      $transaction: async () => {
        throw new Error('connection lost')
      },
    }

    await expect(
      processor.process(job({ orderId: 1, updatedIngredients: [], deducted: [{ ingredientId: 3, quantity: 1 }] }, 0, 3)),
    ).rejects.toThrow('Failed to sync stock with database.')

    expect(calls.reverted).toEqual([])
  })

  it('lỗi tạm thời ở lần thử CUỐI: hoàn tác Redis đúng một lần rồi ném', async () => {
    const { processor, calls } = makeFakes()
    ;(processor as any).prisma = {
      $transaction: async () => {
        throw new Error('connection lost')
      },
    }

    await expect(
      processor.process(job({ orderId: 1, updatedIngredients: [], deducted: [{ ingredientId: 3, quantity: 1 }] }, 2, 3)),
    ).rejects.toThrow('Failed to sync stock with database.')

    expect(calls.reverted).toEqual([{ ingredientId: 3, quantity: 1 }])
  })

  /**
   * Regression (audit trước prod): job ghi `stock: { set: newStock }` — số tuyệt đối tính trên
   * Redis lúc bán. Nếu giữa lúc bán và lúc job chạy có phiếu nhập hàng thì phần vừa nhập bị xoá
   * khỏi DB, trong khi Redis vẫn đúng ⇒ lệch vĩnh viễn.
   */
  it('có `deducted`: ghi DELTA, không ghi đè số tuyệt đối', async () => {
    const { processor, calls } = makeFakes()

    await processor.process(
      job({
        orderId: 1,
        updatedIngredients: [{ ingredientId: 8, newStock: 8 }],
        deducted: [{ ingredientId: 8, quantity: 4 }],
      }),
    )

    expect(calls.stockDeltas).toEqual([{ id: 8, delta: 4 }])
    expect(calls.stockWrites).toEqual([])
  })
})
