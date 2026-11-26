import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/service/prisma.service'

/**
 * Bàn phải do NHÂN VIÊN mở thì khách mới quét QR gọi món được.
 *
 * Vì sao: trước đây chính khách login tự set bàn thành OCCUPIED, nên ai có ảnh chụp QR
 * (chụp lúc đi qua, hoặc được gửi qua chat) cũng đặt món từ nhà — và chiếm luôn bàn của
 * khách thật. Test này khoá đúng hành vi đó.
 */
describe('Mở bàn trước khi khách quét QR (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let token: string
  const createdTableIds: number[] = []

  const api = () => request(app.getHttpServer())
  const auth = () => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    const login = await api().post('/auth/login').send({ email: 'admin@order.com', password: '123456' })
    token = login.body.accessToken
  })

  afterAll(async () => {
    if (createdTableIds.length) {
      await prisma.guest.deleteMany({ where: { tableNodeId: { in: createdTableIds } } })
      await prisma.tableNode.deleteMany({ where: { id: { in: createdTableIds } } })
    }
    await app.close()
  })

  /** bàn mới tinh, trạng thái AVAILABLE, chưa mở phiên nào */
  const createTable = async (status: 'AVAILABLE' | 'OUT_OF_SERVICE' = 'AVAILABLE') => {
    const area = await prisma.area.findFirst({ where: { deletedAt: null }, orderBy: { id: 'asc' } })
    const table = await prisma.tableNode.create({
      data: {
        name: `e2e bàn mở ${Date.now()}-${Math.round(Math.random() * 1000)}`,
        seats: 4,
        type: 'TABLE',
        status,
        positionX: 0,
        positionY: 0,
        width: 60,
        height: 60,
        imageUrl: '',
        areaId: area!.id,
        branchId: area!.branchId,
        token: `e2etoken${Date.now()}${Math.round(Math.random() * 1000)}`,
      },
    })
    createdTableIds.push(table.id)
    return table
  }

  const guestLogin = (table: { id: number; token: string }, name = 'Khách E2E') =>
    api().post('/guest/login').send({ tableNodeId: table.id, token: table.token, name })

  it('bàn CHƯA mở: khách quét QR bị từ chối, và bàn KHÔNG bị đổi trạng thái', async () => {
    const table = await createTable()

    const res = await guestLogin(table).expect(422)
    expect(res.body.message).toBe('Error.TableNotOpened')

    // điểm quan trọng: trước đây chính khách login làm bàn thành OCCUPIED
    const after = await prisma.tableNode.findUnique({ where: { id: table.id } })
    expect(after!.status).toBe('AVAILABLE')
    expect(after!.openedAt).toBeNull()
  })

  it('danh sách bàn phải trả `openedAt` (nếu không FE luôn hiện "Chưa mở")', async () => {
    const table = await createTable()
    await api().post(`/table-node/${table.id}/open`).set(auth()).expect(201)

    // danh sách có phân trang -> xin trang lớn để chắc chắn bàn vừa tạo có trong kết quả
    const list = await api().get('/table-node?limit=100').set(auth()).expect(200)
    const row = (list.body.data as any[]).find((item) => item.id === table.id)
    expect(row).toBeTruthy()
    // serializer chỉ trả trường có trong schema -> thiếu khai báo là mất âm thầm
    expect(row.openedAt).toBeTruthy()
    expect(row.openedById).toBeTruthy()
  })

  it('nhân viên mở bàn -> khách quét được; bàn ghi ai mở, lúc nào', async () => {
    const table = await createTable()

    const opened = await api().post(`/table-node/${table.id}/open`).set(auth()).expect(201)
    expect(opened.body.data.status).toBe('OCCUPIED')
    expect(opened.body.data.openedById).toBeTruthy()
    expect(opened.body.data.openedAt).toBeTruthy()

    const login = await guestLogin(table).expect(201)
    expect(login.body.accessToken).toBeTruthy()

    // khách login KHÔNG được ghi đè người mở bàn
    const after = await prisma.tableNode.findUnique({ where: { id: table.id } })
    expect(after!.openedById).toBe(opened.body.data.openedById)
  })

  it('nhiều khách cùng bàn: người thứ 2 vẫn vào được (bàn đã mở)', async () => {
    const table = await createTable()
    await api().post(`/table-node/${table.id}/open`).set(auth()).expect(201)

    await guestLogin(table, 'Khách A').expect(201)
    await guestLogin(table, 'Khách B').expect(201)
  })

  it('mở bàn hai lần: lần 2 báo 409 (không ghi đè người phụ trách)', async () => {
    const table = await createTable()
    await api().post(`/table-node/${table.id}/open`).set(auth()).expect(201)
    const second = await api().post(`/table-node/${table.id}/open`).set(auth()).expect(409)
    expect(second.body.message).toBe('Error.TableAlreadyOpened')
  })

  it('bàn hỏng: không mở được', async () => {
    const table = await createTable('OUT_OF_SERVICE')
    const res = await api().post(`/table-node/${table.id}/open`).set(auth()).expect(400)
    expect(res.body.message).toBe('Error.TableBrokenOrUnavailable')
  })

  it('đóng bàn -> khách quét lại bị từ chối như lúc chưa mở', async () => {
    const table = await createTable()
    await api().post(`/table-node/${table.id}/open`).set(auth()).expect(201)
    await guestLogin(table).expect(201)

    await api().post(`/table-node/${table.id}/close`).set(auth()).expect(201)

    const after = await prisma.tableNode.findUnique({ where: { id: table.id } })
    expect(after!.status).toBe('AVAILABLE')
    expect(after!.openedAt).toBeNull()
    expect(after!.openedById).toBeNull()

    await guestLogin(table).expect(422)
  })
})
