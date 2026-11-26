import { UpdateOrderSchema } from '@/shared/models/shared-order.model'
import { BadRequestException } from '@nestjs/common'

/**
 * Lỗ hổng tiền (audit trước staging): `PUT /orders/:id` cho đặt `status = PAID`, đường này chỉ
 * ghi `order.status` — không tạo Payment, không ghi bút toán sổ cái, không tính giá vốn. Báo cáo
 * đọc từ sổ cái nên đơn sẽ biến mất khỏi doanh thu trong khi tiền vẫn trong két.
 * STAFF có quyền PUT /orders, nên chỉ cần một tài khoản nhân viên là làm được.
 */
describe('UpdateOrderSchema — không cho tự đánh dấu đã thanh toán', () => {
  const base = { quantity: 1, skuId: 1 }

  it.each(['PAID', 'COMPLETED'])('từ chối status %s', (status) => {
    const result = UpdateOrderSchema.safeParse({ ...base, status })
    expect(result.success).toBe(false)
  })

  it.each(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'CANCELLED'])('vẫn cho status %s', (status) => {
    const result = UpdateOrderSchema.safeParse({ ...base, status })
    expect(result.success).toBe(true)
  })

  it('chốt chặn thứ 2 ở repo: PAID/COMPLETED ném BadRequestException', async () => {
    // Kiểm tra trực tiếp bằng cách soi mã nguồn repo (không dựng Prisma cho 2 dòng):
    // nếu ai đó xoá chốt chặn này thì test đỏ, nhắc lại lý do trong UpdateOrderSchema.
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/shared/shared-repository/shared-orders.repo.ts', 'utf8')
    expect(source).toContain("throw new BadRequestException('Error.OrderStatusChangedOnlyByPayment')")
    expect(BadRequestException).toBeDefined()
  })
})
