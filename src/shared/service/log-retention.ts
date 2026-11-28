import { Prisma, PrismaClient } from '@prisma/client'
import { planPrune, RetentionLogTable } from '@/shared/service/log-retention-policy'

/**
 * Thực thi việc dọn nhật ký — chỗ DUY NHẤT trong hệ thống xoá dòng của `AccessLog`/`LoginAttempt`.
 *
 * Nhận thẳng một Prisma client thay vì phụ thuộc Nest: đây là việc định kỳ của quản trị, phải chạy
 * được khi app không bật (cùng lý do với `customer.anonymize`).
 *
 * Xoá bằng một câu SQL có `LIMIT` chứ không dùng `deleteMany`: `deleteMany` không giới hạn số dòng,
 * nên một lần gõ sai `--months` là một lệnh xoá toàn bảng không có điểm dừng. Ở đây mỗi bảng bị xoá
 * tối đa `limit` dòng, phần còn lại để lần chạy sau — người chạy kịp đọc con số trước khi đi tiếp.
 */

export type PruneTableResult = {
  table: RetentionLogTable
  /** số dòng đã quá hạn (TRƯỚC lần chạy này), không phụ thuộc trần */
  overdue: number
  /** số dòng thực sự bị xoá trong lần chạy này */
  deleted: number
}

export type PruneSummary = {
  cutoff: Date
  retentionMonths: number
  limit: number
  apply: boolean
  tables: PruneTableResult[]
}

/**
 * Một câu SQL cho mỗi bảng, viết tường minh thay vì ghép tên bảng vào chuỗi: tên bảng đến từ tham
 * số là đường tiêm SQL, còn ở đây chỉ có hai hằng viết cứng trong bảng ánh xạ.
 */
const DELETE_STATEMENTS: Record<RetentionLogTable, (cutoff: Date, limit: number) => Prisma.Sql> = {
  AccessLog: (cutoff, limit) =>
    Prisma.sql`DELETE FROM "AccessLog" WHERE "id" IN (
      SELECT "id" FROM "AccessLog" WHERE "createdAt" < ${cutoff} ORDER BY "createdAt" ASC LIMIT ${limit}
    )`,
  LoginAttempt: (cutoff, limit) =>
    Prisma.sql`DELETE FROM "LoginAttempt" WHERE "id" IN (
      SELECT "id" FROM "LoginAttempt" WHERE "createdAt" < ${cutoff} ORDER BY "createdAt" ASC LIMIT ${limit}
    )`,
}

/**
 * Dọn nhật ký quá hạn. `apply = false` chỉ ĐẾM (chạy thử) — mặc định của script là chế độ này.
 *
 * Ném lỗi khi tham số vô nghĩa thay vì lặng lẽ không làm gì: đây là lệnh xoá bằng chứng, im lặng
 * thành công trong khi thực ra chưa xoá gì còn tệ hơn báo lỗi.
 */
export async function pruneLogs(
  db: PrismaClient,
  input: { now: Date; retentionMonths: number; apply: boolean; limit?: number },
): Promise<PruneSummary> {
  const plan = planPrune({ now: input.now, retentionMonths: input.retentionMonths, limit: input.limit })
  if (!plan) {
    throw new Error(
      `Thời hạn lưu không hợp lệ: --months phải là số tháng dương (nhận ${input.retentionMonths}), --limit phải là số nguyên dương.`,
    )
  }

  const tables: PruneTableResult[] = []
  for (const table of plan.tables) {
    const overdue =
      table === 'AccessLog'
        ? await db.accessLog.count({ where: { createdAt: { lt: plan.cutoff } } })
        : await db.loginAttempt.count({ where: { createdAt: { lt: plan.cutoff } } })

    // Chỉ chạm DB khi thật sự có gì để xoá: câu DELETE trên bảng rỗng vẫn là một lần ghi.
    const deleted = input.apply && overdue > 0 ? await db.$executeRaw(DELETE_STATEMENTS[table](plan.cutoff, plan.limit)) : 0

    tables.push({ table, overdue, deleted })
  }

  return {
    cutoff: plan.cutoff,
    retentionMonths: plan.retentionMonths,
    limit: plan.limit,
    apply: input.apply,
    tables,
  }
}
