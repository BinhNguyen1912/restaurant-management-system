import { PrismaClient } from '@prisma/client'
import { pruneLogs } from '../src/shared/service/log-retention'

/**
 * Dọn nhật ký theo thời hạn lưu — kiểm trên DB THẬT (`AccessLog`, `LoginAttempt`).
 *
 * Spec này không gọi HTTP vì việc dọn không đi qua app: nó là script chạy định kỳ. Nhưng nó phải
 * kiểm đúng những thứ chỉ DB thật mới nói được: câu DELETE có thật sự xoá đúng dòng, dòng còn hạn
 * còn nguyên, trần mỗi lần chạy có tác dụng, và trigger append-only không bị lỏng đi.
 *
 * Mốc thời gian tính TƯƠNG ĐỐI so với lúc chạy, không hard-code ngày: hard-code thì hôm nào máy
 * chạy có đồng hồ khác là test xoá nhầm dữ liệu của spec khác.
 */
const prisma = new PrismaClient()

/** dấu nhận dòng của chính spec này, để dọn lại sau mỗi test */
const ROUTE = 'GET /test/prune-logs'
const EMAIL_HASH = 'e'.repeat(64)
/** 24 tháng trước — chắc chắn quá hạn với thời hạn 12 tháng */
const ancientDate = () => new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000)

const makeAccessLog = (createdAt: Date) =>
  prisma.accessLog.create({ data: { route: ROUTE, subjectType: 'USER', subjectId: 1, createdAt } })

const makeLoginAttempt = (createdAt: Date) =>
  prisma.loginAttempt.create({ data: { emailHash: EMAIL_HASH, outcome: 'SUCCESS', createdAt } })

const cleanup = async () => {
  await prisma.accessLog.deleteMany({ where: { route: ROUTE } })
  await prisma.loginAttempt.deleteMany({ where: { emailHash: EMAIL_HASH } })
}

const ancientAccessLogs = async () => prisma.accessLog.count({ where: { route: ROUTE, createdAt: { lt: ancientDate() } } })

beforeEach(cleanup)
afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe('logs:prune', () => {
  it('chạy thử chỉ ĐẾM: không xoá dòng nào', async () => {
    const ancient = [await makeAccessLog(ancientDate()), await makeAccessLog(ancientDate())]
    await makeAccessLog(new Date())
    await makeLoginAttempt(ancientDate())
    const survived = await makeLoginAttempt(new Date())

    const summary = await pruneLogs(prisma, { now: new Date(), retentionMonths: 12, apply: false })

    expect(summary.tables.map((row) => row.table)).toEqual(['AccessLog', 'LoginAttempt'])
    expect(summary.tables.every((row) => row.deleted === 0)).toBe(true)
    expect(summary.tables[0].overdue).toBeGreaterThanOrEqual(2)
    expect(summary.tables[1].overdue).toBeGreaterThanOrEqual(1)
    // và dòng vẫn còn nguyên
    expect(await prisma.accessLog.count({ where: { id: { in: ancient.map((row) => row.id) } } })).toBe(2)
    expect(await prisma.loginAttempt.findUnique({ where: { id: survived.id } })).not.toBeNull()
  })

  it('--apply xoá dòng quá hạn, giữ nguyên dòng còn hạn', async () => {
    const oldOnes = [await makeAccessLog(ancientDate()), await makeAccessLog(ancientDate())]
    const recent = await makeAccessLog(new Date())
    const oldAttempt = await makeLoginAttempt(ancientDate())
    const recentAttempt = await makeLoginAttempt(new Date())

    const dry = await pruneLogs(prisma, { now: new Date(), retentionMonths: 12, apply: false })
    const applied = await pruneLogs(prisma, { now: new Date(), retentionMonths: 12, apply: true })

    // đã đếm bao nhiêu thì xoá đúng bấy nhiêu (không xoá thừa so với lúc chạy thử)
    expect(applied.tables[0].deleted).toBe(dry.tables[0].overdue)
    expect(applied.tables[1].deleted).toBe(dry.tables[1].overdue)

    expect(await prisma.accessLog.count({ where: { id: { in: oldOnes.map((row) => row.id) } } })).toBe(0)
    expect(await prisma.loginAttempt.findUnique({ where: { id: oldAttempt.id } })).toBeNull()
    // còn hạn thì còn nguyên — đây là nửa quan trọng hơn của việc dọn
    expect(await prisma.accessLog.findUnique({ where: { id: recent.id } })).not.toBeNull()
    expect(await prisma.loginAttempt.findUnique({ where: { id: recentAttempt.id } })).not.toBeNull()
  })

  it('trần mỗi lần chạy có tác dụng: xoá đúng `limit` dòng, phần dư để lần sau', async () => {
    for (let index = 0; index < 4; index += 1) await makeAccessLog(ancientDate())

    const first = await pruneLogs(prisma, { now: new Date(), retentionMonths: 12, apply: true, limit: 2 })
    expect(first.tables[0].deleted).toBe(2)
    expect(await ancientAccessLogs()).toBe(2)

    const second = await pruneLogs(prisma, { now: new Date(), retentionMonths: 12, apply: true, limit: 2 })
    expect(second.tables[0].deleted).toBe(2)
    expect(await ancientAccessLogs()).toBe(0)
  })

  it('chạy lại khi không còn gì quá hạn thì không xoá gì', async () => {
    await makeAccessLog(ancientDate())
    await pruneLogs(prisma, { now: new Date(), retentionMonths: 12, apply: true })

    const again = await pruneLogs(prisma, { now: new Date(), retentionMonths: 12, apply: true })
    expect(again.tables.every((row) => row.deleted === 0)).toBe(true)
    expect(again.tables.every((row) => row.overdue === 0)).toBe(true)
  })

  it('trigger append-only vẫn chặn UPDATE sau khi dọn', async () => {
    const recent = await makeAccessLog(new Date())
    await makeLoginAttempt(new Date())

    await expect(
      prisma.$executeRawUnsafe(`UPDATE "AccessLog" SET "route" = 'x' WHERE "id" = ${recent.id}`),
    ).rejects.toThrow()
    await expect(prisma.$executeRawUnsafe(`UPDATE "LoginAttempt" SET "ip" = 'x'`)).rejects.toThrow()
  })

  it('thời hạn không hợp lệ thì ném lỗi và KHÔNG xoá gì', async () => {
    await makeAccessLog(ancientDate())

    await expect(pruneLogs(prisma, { now: new Date(), retentionMonths: 0, apply: true })).rejects.toThrow(
      /Thời hạn lưu không hợp lệ/,
    )
    expect(await ancientAccessLogs()).toBe(1)
  })
})
