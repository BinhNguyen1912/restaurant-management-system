import { $Enums } from '@prisma/client'
import { LedgerEntryQuerySchema, LedgerRefTypeSchema } from '@/routes/ledger-entry/ledger-entry.model'

/**
 * Enum này là bản viết tay của `LedgerRefType` trong Prisma schema, và nó từng thiếu
 * `SHIFT_OPENING_FLOAT`: bút toán mở ca có trong DB nhưng model trả về không parse được, nên
 * `GET /ledger/entries` ném ZodSerializationException -> 500. Ca mở mỗi ngày, nên trang sổ cái
 * hỏng ngay ngày đầu vận hành. Test dưới đây chặn đúng kiểu lệch đó tái diễn.
 */
describe('LedgerRefTypeSchema (nhật ký sổ cái)', () => {
  it('phủ đúng toàn bộ giá trị của enum Prisma, không thiếu không thừa', () => {
    const inSchema = [...LedgerRefTypeSchema.options].sort()
    const inPrisma = (Object.values($Enums.LedgerRefType) as string[]).sort()

    expect(inSchema).toEqual(inPrisma)
  })

  it('nhận SHIFT_OPENING_FLOAT ở cả bộ lọc query', () => {
    expect(LedgerEntryQuerySchema.parse({ refType: 'SHIFT_OPENING_FLOAT' }).refType).toBe('SHIFT_OPENING_FLOAT')
  })

  it('vẫn từ chối refType không có trong enum', () => {
    expect(LedgerEntryQuerySchema.safeParse({ refType: 'KHONG_TON_TAI' }).success).toBe(false)
  })
})
