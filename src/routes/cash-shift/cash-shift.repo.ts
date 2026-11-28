import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { CashShiftListQueryType, CreateCashMovementType } from '@/routes/cash-shift/cash-shift.model'

const shiftSelect = {
  id: true,
  branchId: true,
  staffId: true,
  status: true,
  openedAt: true,
  closedAt: true,
  openingFloat: true,
  countedCash: true,
  expectedCash: true,
  variance: true,
  cashIn: true,
  cashOut: true,
  note: true,
  ledgerEntryId: true,
  closedById: true,
  createdAt: true,
  updatedAt: true,
} as const

const movementSelect = {
  id: true,
  shiftId: true,
  type: true,
  reason: true,
  amount: true,
  evidenceUrls: true,
  createdById: true,
  createdAt: true,
} as const

@Injectable()
export class CashShiftRepo {
  constructor(private readonly prismaService: PrismaService) {}

  /** `branchId` undefined = ca đang mở ở BẤT KỲ chi nhánh nào (ADMIN xem tổng) */
  findOpenByBranch(branchId?: number) {
    return this.prismaService.cashShift.findFirst({
      where: { ...(branchId ? { branchId } : {}), status: 'OPEN' },
      select: shiftSelect,
    })
  }

  findOpenByStaff(staffId: number) {
    return this.prismaService.cashShift.findFirst({
      where: { staffId, status: 'OPEN' },
      select: shiftSelect,
    })
  }

  findById(id: number, branchId?: number) {
    return this.prismaService.cashShift.findFirst({
      where: { id, ...(branchId ? { branchId } : {}) },
      select: { ...shiftSelect, movements: { select: movementSelect, orderBy: { createdAt: 'asc' } } },
    })
  }

  create(
    data: { branchId: number; staffId: number; openingFloat: number; note?: string },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prismaService).cashShift.create({
      data: {
        branchId: data.branchId,
        staffId: data.staffId,
        openingFloat: new Prisma.Decimal(data.openingFloat),
        note: data.note ?? null,
      },
      select: shiftSelect,
    })
  }

  async list(query: CashShiftListQueryType, branchId?: number) {
    // undefined = không lọc chi nhánh (ADMIN xem lịch sử ca của mọi chi nhánh)
    const where: Prisma.CashShiftWhereInput = { ...(branchId ? { branchId } : {}) }
    if (query.status) where.status = query.status
    const [data, totalItems] = await Promise.all([
      this.prismaService.cashShift.findMany({
        where,
        select: shiftSelect,
        orderBy: { openedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prismaService.cashShift.count({ where }),
    ])
    return {
      data,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
      page: query.page,
      limit: query.limit,
    }
  }

  addMovement(
    shiftId: number,
    branchId: number,
    data: CreateCashMovementType & { createdById?: number },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prismaService
    return client.cashMovement.create({
      data: {
        shiftId,
        branchId,
        type: data.type,
        reason: data.reason,
        amount: new Prisma.Decimal(data.amount),
        evidenceUrls: data.evidenceUrls ?? [],
        createdById: data.createdById ?? null,
      },
      select: movementSelect,
    })
  }

  /**
   * Σ tien mat da thu trong ca = Payment CASH/SUCCESS co `paidAt` trong [from, to).
   * Dung `paidAt` (thoi diem thu tien) chu khong phai ngay tao don: don tao truoc ca
   * nhung thu tien trong ca van phai vao két cua ca.
   */
  async sumCashPayments({ branchId, from, to }: { branchId: number; from: Date; to?: Date }): Promise<Prisma.Decimal> {
    const result = await this.prismaService.payment.aggregate({
      where: {
        branchId,
        method: 'CASH',
        status: 'SUCCESS',
        paidAt: { gte: from, ...(to ? { lt: to } : {}) },
      },
      _sum: { amount: true },
    })
    return result._sum.amount ?? new Prisma.Decimal(0)
  }

  /** Danh sách khoản thu TIỀN MẶT từ đơn trong ca (cùng bộ lọc với `sumCashPayments`) */
  cashPaymentsIn({ branchId, from, to }: { branchId: number; from: Date; to?: Date }) {
    return this.prismaService.payment.findMany({
      where: {
        branchId,
        method: 'CASH',
        status: 'SUCCESS',
        paidAt: { gte: from, ...(to ? { lt: to } : {}) },
      },
      orderBy: { paidAt: 'asc' },
      select: {
        id: true,
        amount: true,
        paidAt: true,
        method: true,
        order: { select: { id: true } },
      },
    })
  }

  /** Σ thu tay / chi tay trong ca, tach theo loai */
  async sumMovements(shiftId: number): Promise<{ cashIn: Prisma.Decimal; cashOut: Prisma.Decimal }> {
    const rows = await this.prismaService.cashMovement.groupBy({
      by: ['type'],
      where: { shiftId },
      _sum: { amount: true },
    })
    const byType = new Map(rows.map((row) => [row.type, row._sum.amount ?? new Prisma.Decimal(0)]))
    return {
      cashIn: byType.get('IN') ?? new Prisma.Decimal(0),
      cashOut: byType.get('OUT') ?? new Prisma.Decimal(0),
    }
  }

  /** Don tien mat chua thu trong ca (chan dong ca) */
  async findUnpaidCashOrderIds({ branchId, from }: { branchId: number; from: Date }): Promise<number[]> {
    const orders = await this.prismaService.order.findMany({
      where: {
        branchId,
        deletedAt: null,
        createdAt: { gte: from },
        status: { notIn: ['CANCELLED', 'PAID'] },
        payment: { method: 'CASH', status: 'PENDING' },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 20,
    })
    return orders.map((order) => order.id)
  }
}

