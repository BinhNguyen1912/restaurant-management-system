import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/service/prisma.service'
import { RedisService } from '../src/shared/service/redis.service'
import { SharedOrdersRepo } from '../src/shared/shared-repository/shared-orders.repo'
import { deduct_stock, revert_stock } from '../src/shared/constants/lua.constant'

/**
 * Tồn kho: trừ TẤT CẢ HOẶC KHÔNG GÌ (ticket #17).
 *
 * Bug cũ: script trừ từng nguyên liệu ngay trong lúc kiểm → nguyên liệu A bị trừ, nguyên liệu B thiếu
 * → đơn bị từ chối nhưng A đã mất. Test này chạy trên Redis THẬT, đúng đường đi của đơn hàng.
 */
describe('Tồn kho — trừ all-or-nothing (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let redisService: RedisService
  let ordersRepo: SharedOrdersRepo

  const ingredientBase = 990_000
  const createdIngredientIds: number[] = []
  /** recipe gốc của SKU (nếu có) — phải trả lại y nguyên, đừng xoá cache của sku thật */
  const originalRecipes = new Map<string, unknown | null>()
  const originalIngredientHashes = new Map<string, Record<string, string>>()
  /** script đánh dấu SKU OUT_OF_STOCK khi thiếu hàng -> phải trả lại trạng thái cũ */
  const originalSkuStatuses = new Map<number, string>()

  const ingredientKey = (id: number) => `ingredient:${id}`
  const recipeKey = (skuId: number) => `recipe:${skuId}`
  const script = (name: string) => {
    const content = redisService.luaScripts.get(name.split('.')[0])
    if (!content) throw new Error(`Lua script chưa nạp: ${name}`)
    return content
  }

  /** ghi hash tồn kho lên Redis (giữ bản gốc để trả lại sau) */
  const setRedisStock = async (ingredientId: number, stock: number, unitId: string, name: string) => {
    const key = ingredientKey(ingredientId)
    if (!originalIngredientHashes.has(key)) {
      const flat = await redisService.getHash<string>(key)
      originalIngredientHashes.set(key, (flat as Record<string, string>) ?? {})
    }
    await redisService.setHash(key, { stock, minStock: 0, unitId, name })
  }

  const redisStock = async (ingredientId: number) => {
    const flat = await redisService.getHash<string>(ingredientKey(ingredientId))
    return Number(flat?.stock ?? 0)
  }

  const setRecipe = async (skuId: number, rows: { ingredientId: number; quantity: number; unitId: string }[]) => {
    const key = recipeKey(skuId)
    if (!originalRecipes.has(key)) originalRecipes.set(key, await redisService.getJson(key))
    await redisService.setJson(key, rows)
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    redisService = app.get(RedisService)
    ordersRepo = app.get(SharedOrdersRepo)
  })

  afterAll(async () => {
    // trả lại hash gốc (hoặc xoá nếu trước đó chưa có)
    for (const [key, hash] of originalIngredientHashes) {
      if (Object.keys(hash).length === 0) {
        await redisService.del(key)
      } else {
        await redisService.setHash(key, hash)
      }
    }
    // trả lại recipe gốc; chỉ xoá khi trước đó vốn không có
    for (const [key, value] of originalRecipes) {
      if (value === null) await redisService.del(key)
      else await redisService.setJson(key, value)
    }
    if (createdIngredientIds.length) {
      await prisma.ingredient.deleteMany({ where: { id: { in: createdIngredientIds } } })
    }
    for (const [id, status] of originalSkuStatuses) {
      await prisma.sKU.update({ where: { id }, data: { status: status as never } })
    }
    await app.close()
  })

  const rememberSkuStatus = async (skuId: number) => {
    if (originalSkuStatuses.has(skuId)) return
    const sku = await prisma.sKU.findUnique({ where: { id: skuId }, select: { status: true } })
    if (sku) originalSkuStatuses.set(skuId, sku.status)
  }

  const createIngredient = async (name: string, unitId: string) => {
    const ingredient = await prisma.ingredient.create({
      data: { name: `${name} ${Date.now()}-${Math.round(Math.random() * 1000)}`, unitId, stock: 100, unitCost: 1000 },
    })
    createdIngredientIds.push(ingredient.id)
    return ingredient
  }

  it('thiếu nguyên liệu ở món thứ 2 -> món thứ 1 KHÔNG bị trừ (all-or-nothing)', async () => {
    const unit = await prisma.unit.findFirst({ orderBy: { name: 'asc' } })
    const enough = await createIngredient('e2e tồn đủ', unit!.name)
    const notEnough = await createIngredient('e2e tồn thiếu', unit!.name)
    await setRedisStock(enough.id, 100, unit!.name, enough.name)
    await setRedisStock(notEnough.id, 1, unit!.name, notEnough.name)

    const skus = await prisma.sKU.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' }, take: 2 })
    for (const sku of skus) await rememberSkuStatus(sku.id)
    await setRecipe(skus[0].id, [{ ingredientId: enough.id, quantity: 2, unitId: unit!.name }])
    await setRecipe(skus[1].id, [{ ingredientId: notEnough.id, quantity: 50, unitId: unit!.name }])

    await expect(
      ordersRepo.validateIngredientByLuaBeforeCreateOrder([
        { skuId: skus[0].id, quantity: 1 },
        { skuId: skus[1].id, quantity: 1 },
      ] as never),
    ).rejects.toBeTruthy()

    // điểm mấu chốt của bug cũ: nguyên liệu đủ của món 1 phải còn nguyên
    expect(await redisStock(enough.id)).toBe(100)
    expect(await redisStock(notEnough.id)).toBe(1)
  })

  it('nhu cầu CỘNG DỒN vượt tồn -> chặn (mỗi món riêng lẻ thì vẫn "đủ")', async () => {
    const unit = await prisma.unit.findFirst({ orderBy: { name: 'asc' } })
    const shared = await createIngredient('e2e tồn dùng chung', unit!.name)
    await setRedisStock(shared.id, 10, unit!.name, shared.name)

    const skus = await prisma.sKU.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' }, take: 2 })
    for (const sku of skus) await rememberSkuStatus(sku.id)
    // mỗi món cần 6, tồn 10: từng món đều "đủ", tổng 12 thì không
    await setRecipe(skus[0].id, [{ ingredientId: shared.id, quantity: 6, unitId: unit!.name }])
    await setRecipe(skus[1].id, [{ ingredientId: shared.id, quantity: 6, unitId: unit!.name }])

    await expect(
      ordersRepo.validateIngredientByLuaBeforeCreateOrder([
        { skuId: skus[0].id, quantity: 1 },
        { skuId: skus[1].id, quantity: 1 },
      ] as never),
    ).rejects.toBeTruthy()

    expect(await redisStock(shared.id)).toBe(10)
  })

  it('trừ thành công: cộng dồn đúng, và hoàn tác trả lại đúng số đã trừ', async () => {
    const unit = await prisma.unit.findFirst({ orderBy: { name: 'asc' } })
    const shared = await createIngredient('e2e tồn ok', unit!.name)
    await setRedisStock(shared.id, 100, unit!.name, shared.name)

    const skus = await prisma.sKU.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' }, take: 2 })
    for (const sku of skus) await rememberSkuStatus(sku.id)
    await setRecipe(skus[0].id, [{ ingredientId: shared.id, quantity: 1, unitId: unit!.name }])
    await setRecipe(skus[1].id, [{ ingredientId: shared.id, quantity: 2, unitId: unit!.name }])

    const result = await ordersRepo.validateIngredientByLuaBeforeCreateOrder([
      { skuId: skus[0].id, quantity: 3 },
      { skuId: skus[1].id, quantity: 2 },
    ] as never)

    // 3×1 + 2×2 = 7
    expect(await redisStock(shared.id)).toBe(93)
    expect(result.deducted).toEqual([{ ingredientId: shared.id, quantity: 7 }])
    expect(result.errors).toHaveLength(0)

    // job đồng bộ DB lỗi -> hoàn tác: cộng lại đúng 7
    await redisService.runLuaScript(script(revert_stock), result.deducted)
    expect(await redisStock(shared.id)).toBe(100)
  })

  it('script deduct trả rỗng khi có lỗi (không trả về "updated" nửa vời)', async () => {
    const unit = await prisma.unit.findFirst({ orderBy: { name: 'asc' } })
    const ingredient = await createIngredient('e2e trả rỗng', unit!.name)
    await setRedisStock(ingredient.id, 0, unit!.name, ingredient.name)
    const sku = await prisma.sKU.findFirst({ where: { deletedAt: null }, orderBy: { id: 'asc' } })
    await setRecipe(sku!.id, [{ ingredientId: ingredient.id, quantity: 1, unitId: unit!.name }])

    const raw = await redisService.runLuaScript<Record<string, unknown>>(script(deduct_stock), [
      { skuId: sku!.id, quantity: 5 },
    ])
    // cjson trả bảng rỗng dạng `{}` -> đếm bằng Object.keys để test đúng bản chất "không có gì"
    const count = (value: unknown) => Object.keys((value as Record<string, unknown>) ?? {}).length
    expect(count(raw.errors)).toBeGreaterThan(0)
    expect(count(raw.updated)).toBe(0)
    expect(count(raw.deducted)).toBe(0)
  })
})
