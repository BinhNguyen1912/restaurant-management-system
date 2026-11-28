import { Injectable } from '@nestjs/common'
import { ConsentPurpose, Prisma } from '@prisma/client'
import { PrismaService } from '@/shared/service/prisma.service'
import { OrderStatus, PaymentStatus } from '@/shared/constants/order.constant'
import { roleName } from '@/shared/constants/role.constant'
import { CustomerListQueryType } from '@/routes/customer/customer.model'
import { buildCustomerUpsert, normalizeCustomerPhone } from '@/routes/customer/customer.identity'
import { VND_PER_POINT } from '@/routes/customer/customer.point-policy'

/** Client DB: chạy ngoài transaction hay trong transaction của caller đều dùng được. */
type Db = Prisma.TransactionClient | PrismaService

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

  /**
   * Đơn **còn trừ được điểm** của khách: chưa thu tiền, chưa huỷ, có dòng món (tiền đơn chỉ tính
   * lại được từ `items`). Điều kiện phải KHỚP với `openOrderForPoints` — lệch nhau thì client hiện
   * một đơn mà lúc bấm đổi điểm lại bị từ chối.
   */
  openOrders(customerId: number, branchId: number | undefined, take: number) {
    return this.prismaService.order.findMany({
      where: {
        customerId,
        deletedAt: null,
        status: { notIn: [OrderStatus.PAID, OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
        payment: { status: PaymentStatus.PENDING },
        items: { some: {} },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        status: true,
        subtotal: true,
        discountTotal: true,
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

  /**
   * Điểm TÍCH LUỸ của một lô khách, đọc thẳng từ đơn đã thu tiền.
   *
   * Phải làm tròn XUỐNG THEO TỪNG ĐƠN nên không thể `sum(grandTotal)` rồi chia một lần — và Prisma
   * không có aggregate `FLOOR`, nên đây là chỗ duy nhất trong module phải viết SQL tay. `client`
   * để dùng được cả trong transaction đã khoá hồ sơ khách (lúc đổi điểm).
   */
  async earnedPoints(customerIds: number[], client: Db = this.prismaService): Promise<Map<number, number>> {
    if (customerIds.length === 0) return new Map()
    const rows = await client.$queryRaw<{ customerId: number; points: number }[]>`
      SELECT "customerId", SUM(FLOOR("grandTotal" / ${VND_PER_POINT}::numeric))::int AS points
      FROM "Order"
      WHERE "customerId" IN (${Prisma.join(customerIds)})
        AND "status" = 'PAID'
        AND "deletedAt" IS NULL
      GROUP BY "customerId"`
    return new Map(rows.map((row) => [Number(row.customerId), Number(row.points)]))
  }

  /** Điểm ĐÃ DÙNG của một lô khách — chỉ tính các dòng còn hiệu lực (đơn huỷ thì điểm về lại). */
  async spentPoints(customerIds: number[], client: Db = this.prismaService): Promise<Map<number, number>> {
    if (customerIds.length === 0) return new Map()
    const rows = await client.pointRedemption.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds }, voidedAt: null },
      _sum: { points: true },
    })
    return new Map(rows.map((row) => [row.customerId, row._sum.points ?? 0]))
  }

  /** Hai nửa của số dư điểm của MỘT khách. */
  async pointBalance(customerId: number, client: Db = this.prismaService) {
    const [earned, spent] = await Promise.all([
      this.earnedPoints([customerId], client),
      this.spentPoints([customerId], client),
    ])
    return { earned: earned.get(customerId) ?? 0, spent: spent.get(customerId) ?? 0 }
  }

  /**
   * Khoá hồ sơ khách trong transaction hiện tại (`SELECT … FOR UPDATE`).
   *
   * Số dư điểm được TÍNH chứ không phải counter: hai request đổi điểm đồng thời cùng đọc "còn 30
   * điểm" rồi cùng tạo dòng trừ → âm điểm. Khoá hồ sơ biến chúng thành tuần tự; không có counter
   * nào để `UPDATE … WHERE points >= n` nên đây là chỗ duy nhất giữ được ràng buộc.
   */
  async lockCustomer(tx: Prisma.TransactionClient, customerId: number): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "Customer" WHERE "id" = ${customerId} AND "deletedAt" IS NULL FOR UPDATE`
    return rows.length > 0
  }

  /**
   * Đơn của CHÍNH khách đó để trừ điểm. Trả về cả đơn đã thu tiền để service báo lỗi rõ ràng thay
   * vì im lặng coi như không tìm thấy.
   */
  openOrderForPoints(tx: Prisma.TransactionClient, orderId: number, customerId: number, branchId?: number) {
    return tx.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null, ...(branchId ? { branchId } : {}) },
      select: {
        id: true,
        status: true,
        branchId: true,
        subtotal: true,
        discountTotal: true,
        grandTotal: true,
        taxRate: true,
        serviceChargeRate: true,
        paymentId: true,
        items: { select: { skuPrice: true, quantity: true } },
        payment: { select: { status: true } },
        // đơn đặt cọc: Payment đang giữ tiền CỌC, không phải tổng đơn — xem `redeemPoints`
        reservation: { select: { depositAmount: true } },
        branch: { select: { pricesIncludeTax: true } },
      },
    })
  }

  /** Đơn đã thu tiền — nguồn của phần "điểm kiếm được" trong lịch sử điểm. */
  paidOrdersForPoints(customerId: number, take: number) {
    return this.prismaService.order.findMany({
      where: { customerId, status: OrderStatus.PAID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        grandTotal: true,
        createdAt: true,
        branch: { select: { name: true } },
      },
    })
  }

  /** Các lần đổi điểm — nguồn của phần "điểm đã dùng" trong lịch sử điểm. */
  redemptions(customerId: number, take: number) {
    return this.prismaService.pointRedemption.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        points: true,
        valueVnd: true,
        orderId: true,
        voidedAt: true,
        createdAt: true,
      },
    })
  }

  /**
   * Nhật ký đồng ý dữ liệu cá nhân của khách (mới nhất trước).
   *
   * Đọc CẢ LỊCH SỬ chứ không chỉ dòng mới nhất: trạng thái hiện tại là "dòng mới nhất theo từng mục
   * đích", mà phép đó cần nhiều dòng — và lịch sử chính là bằng chứng khách đã đổi ý lúc nào.
   */
  consents(customerId: number, client: Db = this.prismaService) {
    return client.consentLog.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: { purpose: true, version: true, granted: true, createdAt: true },
    })
  }

  /** Ghi một dòng đồng ý/rút đồng ý — append, KHÔNG sửa dòng cũ (trigger DB chặn UPDATE). */
  appendConsent(
    data: {
      customerId: number
      purpose: ConsentPurpose
      version: string
      granted: boolean
      ip?: string | null
      note?: string | null
      createdById?: number | null
    },
    client: Db = this.prismaService,
  ) {
    return client.consentLog.create({ data, select: { id: true, granted: true, createdAt: true } })
  }
}
