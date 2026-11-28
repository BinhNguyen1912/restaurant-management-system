import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@/shared/service/prisma.service'
import { OrderStatus } from '@/shared/constants/order.constant'
import { roleName } from '@/shared/constants/role.constant'
import { CustomerListQueryType } from '@/routes/customer/customer.model'
import { buildCustomerUpsert, normalizeCustomerPhone } from '@/routes/customer/customer.identity'

/**
 * Đọc/ghi hồ sơ khách. Khách là danh tính **toàn hệ thống** (một người tới chi nhánh nào cũng là
 * người đó), nhưng số liệu chi tiêu thì phải cắt theo chi nhánh khi người xem không phải ADMIN —
 * nhân viên chi nhánh A không được biết khách chi bao nhiêu ở chi nhánh B.
 */
@Injectable()
export class CustomerRepo {
  constructor(private readonly prismaService: PrismaService) {}

  private buildWhere(query: CustomerListQueryType): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { deletedAt: null }
    if (query.search) {
      // SĐT trong DB đã chuẩn hoá nên phải chuẩn hoá cả từ khoá; `raw` để tìm được cả khi khách
      // gõ "+84..." hay "0901 234" (chuỗi số thô vẫn là một phần của SĐT đã lưu).
      const digits = query.search.replace(/\D/g, '')
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
      ]
    }
    return where
  }

  list(query: CustomerListQueryType) {
    const where = this.buildWhere(query)
    const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
      query.sort === 'name' ? [{ name: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }]
    return Promise.all([
      this.prismaService.customer.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          note: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prismaService.customer.count({ where }),
    ])
  }

  findById(id: number) {
    return this.prismaService.customer.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        note: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  /**
   * Số liệu tích luỹ của một lô khách trong MỘT câu groupBy, thay vì một query cho mỗi dòng — danh
   * sách 100 khách không được bắn 200 query.
   */
  async stats(customerIds: number[], branchId?: number) {
    if (customerIds.length === 0) return { orders: [], reservationCounts: new Map<number, number>() }
    const [orders, reservations] = await Promise.all([
      this.prismaService.order.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: customerIds },
          // Chỉ đơn đã thu tiền mới là chi tiêu. Đơn đang mở/huỷ không được tính vào hồ sơ.
          status: OrderStatus.PAID,
          deletedAt: null,
          ...(branchId ? { branchId } : {}),
        },
        _count: { _all: true },
        _sum: { grandTotal: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
      this.prismaService.reservation.groupBy({
        by: ['customerId'],
        where: { customerId: { in: customerIds }, deletedAt: null, ...(branchId ? { branchId } : {}) },
        _count: { _all: true },
      }),
    ])
    return {
      orders,
      reservationCounts: new Map<number, number>(
        reservations
          .filter((row) => row.customerId != null)
          .map((row) => [row.customerId as number, row._count._all]),
      ),
    }
  }

  /** Đơn gần đây của một khách (mới nhất trước) — đủ để trả lời "khách này hay ăn gì". */
  recentOrders(customerId: number, branchId: number | undefined, take: number) {
    return this.prismaService.order.findMany({
      where: { customerId, deletedAt: null, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        status: true,
        grandTotal: true,
        createdAt: true,
        branch: { select: { name: true } },
        tableNode: { select: { name: true } },
      },
    })
  }

  recentReservations(customerId: number, branchId: number | undefined, take: number) {
    return this.prismaService.reservation.findMany({
      where: { customerId, deletedAt: null, ...(branchId ? { branchId } : {}) },
      orderBy: { reservationTime: 'desc' },
      take,
      select: {
        id: true,
        reservationTime: true,
        guestCount: true,
        status: true,
        branch: { select: { name: true } },
        tableNode: { select: { name: true } },
      },
    })
  }

  countProfiles() {
    return this.prismaService.customer.count({ where: { deletedAt: null } })
  }

  /** Nhóm đơn đã thu tiền theo khách trong kỳ — nguồn cho "khách mới / quay lại / top chi tiêu". */
  paidOrdersInRange(range: { gte: Date; lte: Date }, branchId?: number) {
    return this.prismaService.order.groupBy({
      by: ['customerId'],
      where: {
        customerId: { not: null },
        status: OrderStatus.PAID,
        deletedAt: null,
        createdAt: { gte: range.gte, lte: range.lte },
        ...(branchId ? { branchId } : {}),
      },
      _count: { _all: true },
      _sum: { grandTotal: true },
      _max: { createdAt: true },
    })
  }

  /** Lần đầu tới của từng khách (mọi thời gian) — để biết khách trong kỳ là mới hay quay lại. */
  firstVisitOf(customerIds: number[], branchId?: number) {
    return this.prismaService.order.groupBy({
      by: ['customerId'],
      where: {
        customerId: { in: customerIds },
        status: OrderStatus.PAID,
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
      },
      _min: { createdAt: true },
    })
  }

  findManyByIds(ids: number[]) {
    return this.prismaService.customer.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true, phone: true },
    })
  }

  /**
   * Tạo hoặc cập nhật hồ sơ theo SĐT đã chuẩn hoá, dùng được trong transaction của caller
   * (đặt bàn tạo hồ sơ trong cùng transaction với lượt đặt — không có khách mồ côi).
   */
  async upsertProfile(
    tx: Prisma.TransactionClient,
    input: { phone: string; name?: string | null; userId?: number | null },
  ): Promise<number> {
    const phone = normalizeCustomerPhone(input.phone)
    if (!phone) throw new Error('Customer phone must be normalized before upsertProfile')

    const { create, update } = buildCustomerUpsert({ ...input, phone })
    // Hồ sơ khách chỉ gắn với TÀI KHOẢN KHÁCH (role USER). Nhân viên cũng có SĐT và cũng đặt bàn
    // được, nhưng họ không phải khách — không chặn ở đây thì báo cáo khách hàng sẽ đếm cả đồng
    // nghiệp và ca trực.
    const accountId = input.userId ? await this.customerAccountId(tx, input.userId) : null

    const existing = await tx.customer.findFirst({ where: { phone }, select: { id: true, userId: true } })
    if (existing) {
      // `update` từ buildCustomerUpsert đã chứa userId thô; bỏ đi rồi gắn lại theo luật unique:
      // chỉ điền khi hồ sơ còn trống và tài khoản chưa thuộc hồ sơ nào khác.
      const patch: Prisma.CustomerUncheckedUpdateInput = { ...update }
      delete patch.userId
      if (accountId && existing.userId === null) {
        const ownedBy = await tx.customer.findUnique({ where: { userId: accountId }, select: { id: true } })
        if (!ownedBy) patch.userId = accountId
      }
      if (Object.keys(patch).length > 0) await tx.customer.update({ where: { id: existing.id }, data: patch })
      return existing.id
    }

    // Cột `userId` là unique: cùng một người đặt bàn bằng hai SĐT thì tài khoản chỉ được gắn vào
    // hồ sơ đầu tiên, còn hồ sơ thứ hai vẫn tạo được (đừng làm hỏng luồng đặt bàn vì việc này).
    const ownedBy = accountId ? await tx.customer.findUnique({ where: { userId: accountId }, select: { id: true } }) : null
    try {
      const created = await tx.customer.create({
        data: { ...create, userId: ownedBy ? null : (accountId ?? null) },
        select: { id: true },
      })
      return created.id
    } catch (error) {
      // Hai lượt đặt bàn đồng thời của cùng một SĐT: dòng kia vừa thắng, dùng lại nó.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await tx.customer.findUniqueOrThrow({ where: { phone }, select: { id: true } })
        return raced.id
      }
      throw error
    }
  }

  /** Id tài khoản nếu `userId` đúng là khách hàng (role USER) còn sống; ngược lại `null`. */
  private async customerAccountId(
    tx: Prisma.TransactionClient,
    userId: number,
  ): Promise<number | null> {
    const account = await tx.user.findFirst({
      where: { id: userId, deletedAt: null, role: { name: roleName.USER } },
      select: { id: true },
    })
    return account?.id ?? null
  }

  updateNote(id: number, note: string | null) {
    return this.prismaService.customer.update({ where: { id }, data: { note }, select: { id: true, note: true } })
  }
}
