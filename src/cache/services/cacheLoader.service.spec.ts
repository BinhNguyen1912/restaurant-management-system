import { CacheLoaderService } from './cacheLoader.service'

/**
 * Regression (audit trước prod): mỗi lần app khởi động lại, `loadIngredients` ghi đè
 * `ingredient:<id>.stock` bằng `Ingredient.stock` trong Postgres. Nhưng luồng bán trừ tồn trên
 * Redis TRƯỚC và chỉ đồng bộ DB sau (BullMQ) ⇒ restart giữa chừng hoàn lại phần đã bán ⇒ bán âm.
 */
describe('CacheLoaderService.loadIngredients', () => {
  const makeService = (dbRows: any[], redisHash: Record<string, string> | null) => {
    const prisma = { ingredient: { findMany: jest.fn().mockResolvedValue(dbRows) } }
    const redis = {
      getHash: jest.fn().mockResolvedValue(redisHash),
      setHash: jest.fn().mockResolvedValue(undefined),
    }
    return { service: new CacheLoaderService(prisma as any, {} as any, redis as any), redis, prisma }
  }

  it('key đã có trong Redis: KHÔNG ghi đè stock, chỉ cập nhật trường tĩnh', async () => {
    const { service, redis } = makeService([{ id: 1, stock: 100, minStock: 5, unitId: 'kg' }], { stock: '90' })

    await service.loadIngredients()

    expect(redis.setHash).toHaveBeenCalledTimes(1)
    expect(redis.setHash).toHaveBeenCalledWith('ingredient:1', { minStock: 5, unitId: 'kg' })
    const wroteStock = redis.setHash.mock.calls.some(([, value]) => Object.keys(value).includes('stock'))
    expect(wroteStock).toBe(false)
  })

  it('Redis trắng: nạp stock từ DB', async () => {
    const { service, redis } = makeService([{ id: 7, stock: 12, minStock: 2, unitId: 'g' }], null)

    await service.loadIngredients()

    expect(redis.setHash).toHaveBeenCalledWith('ingredient:7', { stock: 12, minStock: 2, unitId: 'g' })
  })
})
