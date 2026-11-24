import { AuditLogService } from '@/shared/service/audit-log.service'

/**
 * Ticket #10: nhật ký chỉ ghi, và hành động nhạy cảm BẮT BUỘC có lý do.
 * Test bằng prisma giả: kiểm luật là chính, không cần DB.
 */
const makeService = () => {
  const created: any[] = []
  const prisma = {
    auditLog: {
      create: async ({ data }: any) => {
        created.push(data)
        return { id: created.length, ...data }
      },
    },
  }
  const service = new AuditLogService(prisma as any)
  return { service, created }
}

describe('AuditLogService', () => {
  it('huỷ đơn thiếu reason -> ném lỗi, KHÔNG ghi dòng nào', async () => {
    const { service, created } = makeService()
    await expect(
      service.record({ action: 'ORDER_CANCELLED', entityType: 'ORDER', entityId: 1, actorId: 7 }),
    ).rejects.toThrow(/bắt buộc có reason/)
    expect(created).toHaveLength(0)
  })

  it('reason chỉ có khoảng trắng cũng coi như thiếu', async () => {
    const { service } = makeService()
    await expect(
      service.record({ action: 'PAYMENT_REFUNDED', entityType: 'PAYMENT', entityId: 1, reason: '   ' }),
    ).rejects.toThrow(/bắt buộc có reason/)
  })

  it('huỷ đơn có reason -> ghi đúng action/entity/before/after/reason', async () => {
    const { service, created } = makeService()
    await service.record({
      action: 'ORDER_CANCELLED',
      entityType: 'ORDER',
      entityId: 42,
      actorId: 7,
      actorRole: 'ADMIN',
      branchId: 1,
      reason: 'khách đổi ý',
      before: { status: 'PENDING' },
      after: { status: 'CANCELLED' },
    })
    expect(created[0]).toMatchObject({
      action: 'ORDER_CANCELLED',
      entityType: 'ORDER',
      entityId: 42,
      actorId: 7,
      actorRole: 'ADMIN',
      branchId: 1,
      reason: 'khách đổi ý',
      before: { status: 'PENDING' },
      after: { status: 'CANCELLED' },
    })
  })

  it('giảm giá / sửa giá KHÔNG bắt buộc reason (chỉ cần before/after)', async () => {
    const { service, created } = makeService()
    await service.record({
      action: 'ORDER_DISCOUNT_CHANGED',
      entityType: 'ORDER',
      entityId: 42,
      before: { discountTotal: '0' },
      after: { discountTotal: '20000' },
    })
    expect(created).toHaveLength(1)
    expect(created[0].reason).toBeNull()
  })

  it('recordSafe: prisma lỗi thì trả null, KHÔNG ném ra (không chặn nghiệp vụ)', async () => {
    const service = new AuditLogService({
      auditLog: {
        create: async () => {
          throw new Error('db down')
        },
      },
    } as any)
    await expect(
      service.recordSafe({ action: 'PRODUCT_PRICE_CHANGED', entityType: 'PRODUCT', entityId: 1 }),
    ).resolves.toBeNull()
  })
})
