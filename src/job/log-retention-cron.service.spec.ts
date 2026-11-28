import { LogRetentionCronService } from '@/job/log-retention-cron.service'
import envConfig from '@/shared/config'
import { pruneLogs, PruneSummary } from '@/shared/service/log-retention'

jest.mock('@/shared/service/log-retention', () => ({ pruneLogs: jest.fn() }))

const pruneLogsMock = pruneLogs as jest.MockedFunction<typeof pruneLogs>

/**
 * Job dọn nhật ký — phần CHỈ có ở đây: khi nào chạy, khi nào bỏ qua, lỗi thì thế nào.
 *
 * Việc xoá dòng gì đã được đo ở `log-retention-policy.spec.ts` và
 * `test/log-retention-prune.e2e-spec.ts`; ở đây chỉ kiểm cái vỏ: một job tự động xoá bằng chứng
 * phải im lặng đúng lúc (thiếu cấu hình) và không được chạy chồng.
 */
const summary = (deleted = 1, overdue = 1): PruneSummary => ({
  cutoff: new Date('2025-11-28T00:00:00.000Z'),
  retentionMonths: 12,
  limit: 5000,
  apply: true,
  tables: [
    { table: 'AccessLog', overdue, deleted },
    { table: 'LoginAttempt', overdue: 0, deleted: 0 },
  ],
})

const setMonths = (value: string | undefined) => {
  ;(envConfig as { LOG_RETENTION_MONTHS?: string }).LOG_RETENTION_MONTHS = value
}

const originalNodeEnv = process.env.NODE_ENV

beforeEach(() => {
  pruneLogsMock.mockReset()
  pruneLogsMock.mockResolvedValue(summary())
  process.env.NODE_ENV = 'development'
  setMonths('12')
})

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
  setMonths(undefined)
})

const makeService = () => new LogRetentionCronService({} as never)

describe('LogRetentionCronService', () => {
  it('chưa đặt LOG_RETENTION_MONTHS thì KHÔNG dọn (và không tự chọn con số)', async () => {
    setMonths(undefined)

    await makeService().pruneExpiredLogs()

    expect(pruneLogsMock).not.toHaveBeenCalled()
  })

  it('con số vô nghĩa cũng không dọn', async () => {
    for (const value of ['abc', '0', '-3', '']) {
      setMonths(value)
      await makeService().pruneExpiredLogs()
    }

    expect(pruneLogsMock).not.toHaveBeenCalled()
  })

  it('có con số hợp lệ thì dọn thật (apply = true), đúng số tháng', async () => {
    await makeService().pruneExpiredLogs()

    expect(pruneLogsMock).toHaveBeenCalledWith(expect.anything(), {
      now: expect.any(Date),
      retentionMonths: 12,
      apply: true,
    })
  })

  it('không chạy trong test — cron thật trong e2e sẽ xoá dòng của chính suite đang chạy', async () => {
    process.env.NODE_ENV = 'test'

    await makeService().pruneExpiredLogs()

    expect(pruneLogsMock).not.toHaveBeenCalled()
  })

  it('dọn lỗi thì nuốt lỗi và ghi log, không làm sập app', async () => {
    pruneLogsMock.mockRejectedValue(new Error('mất kết nối DB'))

    await expect(makeService().pruneExpiredLogs()).resolves.toBeUndefined()
  })

  it('lượt trước chưa xong thì bỏ qua lượt này, không chạy chồng', async () => {
    let release: (value: PruneSummary) => void = () => {}
    pruneLogsMock.mockImplementation(
      () =>
        new Promise<PruneSummary>((resolve) => {
          release = resolve
        }),
    )
    const service = makeService()

    const first = service.pruneExpiredLogs()
    await service.pruneExpiredLogs()

    expect(pruneLogsMock).toHaveBeenCalledTimes(1)
    release(summary())
    await first
  })
})
