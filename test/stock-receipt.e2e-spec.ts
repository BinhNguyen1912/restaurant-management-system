import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/service/prisma.service'
import { RedisService } from '../src/shared/service/redis.service'
import { CACHE_KEYS } from '../src/cache/cache.constant'

/**
 * Nhập hàng (ticket #13).
 *
 * Ba điều phải đúng, và đây là lý do có test riêng:
 *  1. tồn kho CỘNG DỒN (nhập 5 rồi nhập 5 = +10), không ghi đè — trước đây sửa tay bằng số
 *     tuyệt đối nên gõ nhầm là mất tồn;
 *  2. giá vốn tính lại theo BÌNH QUÂN GIA QUYỀN để COGS sát thực tế;
 *  3. Redis phải được cập nhật ngay, vì trừ kho khi bán đọc từ Redis — chỉ ghi DB thì lần bán
 *     sau vẫn báo "không đủ tồn" dù vừa nhập hàng.
 */
describe('Nhập hàng (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let redisService: RedisService
  let token: string
  const createdIngredientIds: number[] = []

  const api = () => request(app.getHttpServer())
  const auth = () => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    redisService = app.get(RedisService)

    const login = await api().post('/auth/login').send({ email: 'admin@order.com', password: '123456' })
    expect(login.status).toBe(201)
    token = login.body.accessToken
  })

  afterAll(async () => {
    if (createdIngredientIds.length) {
      await prisma.stockReceipt.deleteMany({ where: { ingredientId: { in: createdIngredientIds } } })
      await prisma.ingredient.deleteMany({ where: { id: { in: createdIngredientIds } } })
      for (const id of createdIngredientIds) await redisService.del(CACHE_KEYS.INGREDIENT(id))
    }
    await app.close()
  })

  const createIngredient = async (stock: number, unitCost: number) => {
    const unit = await prisma.unit.findFirst({ orderBy: { name: 'asc' } })
    const ingredient = await prisma.ingredient.create({
      data: {
        name: `e2e nhập hàng ${Date.now()}-${Math.round(Math.random() * 1000)}`,
        unitId: unit!.name,
        stock,
        unitCost,
      },
    })
    createdIngredientIds.push(ingredient.id)
    return ingredient
  }

  it('cộng dồn tồn kho và tính lại giá vốn bình quân gia quyền', async () => {
    const ingredient = await createIngredient(10, 20_000) // tồn 10, giá 20.000

    const first = await api()
      .post(`/ingredients/${ingredient.id}/receipts`)
      .set(auth())
      .send({ quantity: 10, unitCost: 40_000, supplier: 'NCC A', note: 'lô 1', images: ['https://x/a.jpg'] })
      .expect(201)

    // (10*20.000 + 10*40.000) / 20 = 30.000
    expect(first.body.data.stock).toBe(20)
    expect(first.body.data.unitCost).toBe(30_000)
    expect(first.body.data.receipt.stockAfter).toBe(20)
    expect(first.body.data.receipt.images).toEqual(['https://x/a.jpg'])

    // lần 2: nhập thêm 20 với giá 30.000 -> tồn 40, giá vẫn 30.000
    const second = await api()
      .post(`/ingredients/${ingredient.id}/receipts`)
      .set(auth())
      .send({ quantity: 20, unitCost: 30_000 })
      .expect(201)
    expect(second.body.data.stock).toBe(40)
    expect(second.body.data.unitCost).toBe(30_000)

    // DB đã cộng đúng, không ghi đè
    const row = await prisma.ingredient.findUnique({ where: { id: ingredient.id } })
    expect(Number(row!.stock)).toBe(40)
    expect(Number(row!.unitCost)).toBe(30_000)
  })

  it('giá vốn cũ = 0 (chưa khai) thì lấy giá lần nhập này, không kéo giá xuống', async () => {
    // 4kg với unitCost 0 không có nghĩa là "hàng miễn phí" — đó là CHƯA KHAI GIÁ.
    // Bình quân máy móc sẽ ra 27.777đ trong khi thực tế vừa mua 50.000đ -> COGS sai.
    const ingredient = await createIngredient(4, 0)

    const res = await api()
      .post(`/ingredients/${ingredient.id}/receipts`)
      .set(auth())
      .send({ quantity: 5, unitCost: 50_000 })
      .expect(201)

    expect(res.body.data.stock).toBe(9)
    expect(res.body.data.unitCost).toBe(50_000)

    // nhưng khi ĐÃ biết giá cũ thì vẫn bình quân đúng
    const next = await api()
      .post(`/ingredients/${ingredient.id}/receipts`)
      .set(auth())
      .send({ quantity: 9, unitCost: 100_000 })
      .expect(201)
    // (9*50.000 + 9*100.000) / 18 = 75.000
    expect(next.body.data.unitCost).toBe(75_000)
  })

  it('đồng bộ Redis ngay: trừ kho khi bán đọc từ Redis nên không được để số cũ', async () => {
    const ingredient = await createIngredient(0, 0)
    await redisService.setHash(CACHE_KEYS.INGREDIENT(ingredient.id), {
      stock: 0,
      minStock: 0,
      unitId: ingredient.unitId,
      name: ingredient.name,
    })

    await api()
      .post(`/ingredients/${ingredient.id}/receipts`)
      .set(auth())
      .send({ quantity: 7, unitCost: 5_000 })
      .expect(201)

    const hash = await redisService.getHash<string>(CACHE_KEYS.INGREDIENT(ingredient.id))
    expect(Number(hash?.stock)).toBe(7)
  })

  it('lịch sử nhập hàng: trả đủ các lần, mới nhất trước, kèm người nhập và ảnh', async () => {
    const ingredient = await createIngredient(0, 0)
    for (const quantity of [1, 2, 3]) {
      await api()
        .post(`/ingredients/${ingredient.id}/receipts`)
        .set(auth())
        .send({ quantity, unitCost: 1_000, images: [`https://x/${quantity}.jpg`] })
        .expect(201)
    }

    const list = await api().get(`/ingredients/${ingredient.id}/receipts`).set(auth()).expect(200)
    expect(list.body.data).toHaveLength(3)
    expect(list.body.data[0].quantity).toBe(3) // mới nhất trước
    expect(list.body.data[0].createdByName).toBe('admin')
    expect(list.body.data[0].images).toEqual(['https://x/3.jpg'])
  })

  it('nhập số lượng 0 hoặc âm bị từ chối (không dùng đường nhập hàng để trừ tồn)', async () => {
    const ingredient = await createIngredient(5, 1_000)
    await api().post(`/ingredients/${ingredient.id}/receipts`).set(auth()).send({ quantity: 0 }).expect(400)
    await api().post(`/ingredients/${ingredient.id}/receipts`).set(auth()).send({ quantity: -5 }).expect(400)

    const row = await prisma.ingredient.findUnique({ where: { id: ingredient.id } })
    expect(Number(row!.stock)).toBe(5) // không đổi
  })

  it('có nhật ký nhập hàng: ai nhập, tăng bao nhiêu, ảnh nào', async () => {
    const ingredient = await createIngredient(0, 0)
    await api()
      .post(`/ingredients/${ingredient.id}/receipts`)
      .set(auth())
      .send({ quantity: 4, unitCost: 2_500, supplier: 'NCC B', images: ['https://x/evidence.jpg'] })
      .expect(201)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'STOCK_RECEIVED', entityType: 'INGREDIENT', entityId: ingredient.id },
      orderBy: { id: 'desc' },
    })
    expect(audit).toBeTruthy()
    expect((audit!.after as any).quantity).toBe(4)
    expect((audit!.after as any).stock).toBe(4)
    expect((audit!.after as any).images).toEqual(['https://x/evidence.jpg'])
    expect((audit!.after as any).supplier).toBe('NCC B')
  })
})
