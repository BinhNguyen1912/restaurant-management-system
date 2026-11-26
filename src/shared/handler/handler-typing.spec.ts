import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Chặn tái phát: handler thanh toán **không** được khai báo `tx: any`.
 *
 * Hai lỗi thật đã xảy ra vì `tx: any` che mất tên trường sai (TypeScript không kiểm tra được):
 *  - `guest.update({ data: { isClosed: true } })` — `Guest` không có `isClosed`
 *  - `reservation.update({ data: { cancelReason: … } })` — `Reservation` không có `cancelReason`
 * Cả hai chỉ nổ khi có người thanh toán thật, và nổ SAU khi bàn đã được giải phóng.
 *
 * Dùng `Prisma.TransactionClient` thì `tsc` bắt ngay lúc viết.
 */
const HANDLER_DIR = resolve(__dirname)

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

describe('handler thanh toán', () => {
  it('không khai báo `tx: any` (dùng Prisma.TransactionClient)', () => {
    const offenders = walk(HANDLER_DIR)
      .filter((file) => !file.endsWith('handler-typing.spec.ts'))
      .filter((file) => /tx:\s*any/.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(HANDLER_DIR, 'src/shared/handler'))

    expect(offenders).toEqual([])
  })
})
