import { Injectable, NotFoundException } from '@nestjs/common'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { PrismaService } from '@/shared/service/prisma.service'
import { resolveBranchScope } from '@/shared/service/branch.resolver'
import { SYSTEM_TIME_ZONE } from '@/shared/config/timezone'
import { resolveRange } from '@/routes/reports/revenue-summary'
import { CustomerRepo } from '@/routes/customer/customer.repo'
import { CustomerListQueryType, CustomerReportQueryType } from '@/routes/customer/customer.model'

const TOP_CUSTOMERS = 10
const RECENT_ORDERS = 10
const RECENT_RESERVATIONS = 10

const NotFoundCustomerException = new NotFoundException({ message: 'Error.NotFoundCustomer', path: 'id' })

/**
 * Hồ sơ khách hàng.
 *
 * Số liệu ở đây **tính lại từ đơn đã thu tiền**, không lưu bản sao: cùng nguồn với báo cáo doanh
 * thu nên một khách chi 500k thì hồ sơ khách và báo cáo không thể lệch nhau.
 */
@Injectable()
export class CustomerService {
  constructor(
    private readonly repo: CustomerRepo,
    private readonly prismaService: PrismaService,
  ) {}

  /** Chi nhánh để **cắt số liệu**: ADMIN không chọn thì thấy mọi chi nhánh, người khác bị ép về chi nhánh mình. */
  private scopeBranch(query: { branchId?: number }, actor: AccessTokenPayload) {
    return resolveBranchScope(
      this.prismaService,
      { userId: actor.userId, roleName: actor.roleName },
      query.branchId,
    )
  }

  private toCustomer(
    row: {
      id: number
      phone: string
      name: string
      email: string | null
      note: string | null
      userId: number | null
      createdAt: Date
      updatedAt: Date
    },
    orderStats: { count: number; total: number; first: Date | null; last: Date | null } | undefined,
    reservationCount: number,
  ) {
    const orderCount = orderStats?.count ?? 0
    const totalSpend = orderStats?.total ?? 0
    return {
      ...row,
      stats: {
        orderCount,
        totalSpend,
        avgSpend: orderCount > 0 ? Math.round(totalSpend / orderCount) : 0,
        reservationCount,
        firstVisitAt: orderStats?.first ?? null,
        lastVisitAt: orderStats?.last ?? null,
      },
    }
  }

  async list(query: CustomerListQueryType, actor: AccessTokenPayload) {
    const branchId = await this.scopeBranch(query, actor)
    const [rows, totalItems] = await this.repo.list(query)
    const { orders, reservationCounts } = await this.repo.stats(
      rows.map((row) => row.id),
      branchId,
    )
    const statsById = new Map(
      orders
        .filter((row) => row.customerId != null)
        .map((row) => [
          row.customerId as number,
          {
            count: row._count._all,
            total: Number(row._sum.grandTotal?.toString() ?? 0),
            first: row._min.createdAt,
            last: row._max.createdAt,
          },
        ]),
    )

    return {
      message: 'Success.Customers',
      data: rows.map((row) => this.toCustomer(row, statsById.get(row.id), reservationCounts.get(row.id) ?? 0)),
      totalItems,
      page: query.page,
      limit: query.limit,
    }
  }

  async detail(id: number, actor: AccessTokenPayload) {
    const branchId = await this.scopeBranch({}, actor)
    const row = await this.repo.findById(id)
    if (!row) throw NotFoundCustomerException

    const [{ orders, reservationCounts }, recentOrders, recentReservations] = await Promise.all([
      this.repo.stats([id], branchId),
      this.repo.recentOrders(id, branchId, RECENT_ORDERS),
      this.repo.recentReservations(id, branchId, RECENT_RESERVATIONS),
    ])
    const orderRow = orders.find((item) => item.customerId === id)
    const customer = this.toCustomer(
      row,
      orderRow
        ? {
            count: orderRow._count._all,
            total: Number(orderRow._sum.grandTotal?.toString() ?? 0),
            first: orderRow._min.createdAt,
            last: orderRow._max.createdAt,
          }
        : undefined,
      reservationCounts.get(id) ?? 0,
    )

    return {
      message: 'Success.Customer',
      data: {
        ...customer,
        recentOrders: recentOrders.map((order) => ({
          id: order.id,
          status: order.status,
          grandTotal: order.grandTotal,
          branchName: order.branch.name,
          tableName: order.tableNode?.name ?? null,
          createdAt: order.createdAt,
        })),
        recentReservations: recentReservations.map((reservation) => ({
          id: reservation.id,
          reservationTime: reservation.reservationTime,
          guestCount: reservation.guestCount,
          status: reservation.status,
          branchName: reservation.branch.name,
          tableName: reservation.tableNode?.name ?? null,
        })),
      },
    }
  }

  /**
   * Khách mới / khách quay lại / tỉ lệ quay lại + top chi tiêu trong kỳ.
   *
   * "Mới" được định nghĩa theo **lần đầu tới của chính khách đó** (đơn đã thu tiền đầu tiên nằm
   * trong kỳ), không theo ngày tạo hồ sơ: hồ sơ có thể được backfill từ dữ liệu cũ nên ngày tạo
   * không nói gì về việc khách đã tới hay chưa.
   */
  async report(query: CustomerReportQueryType, actor: AccessTokenPayload) {
    const branchId = await this.scopeBranch(query, actor)
    const { from, to, gte, lte } = resolveRange(query.fromDate, query.toDate, SYSTEM_TIME_ZONE)

    const [groups, profileCount] = await Promise.all([
      this.repo.paidOrdersInRange({ gte, lte }, branchId),
      this.repo.countProfiles(),
    ])
    const ids = groups.map((row) => row.customerId).filter((id): id is number => id != null)
    const firstVisits = await this.repo.firstVisitOf(ids, branchId)
    const firstById = new Map(firstVisits.map((row) => [row.customerId as number, row._min.createdAt]))

    let newCustomers = 0
    let returningCustomers = 0
    for (const id of ids) {
      const first = firstById.get(id)
      if (first && first.getTime() < gte.getTime()) returningCustomers += 1
      else newCustomers += 1
    }

    const topIds = [...groups]
      .sort((a, b) => Number(b._sum.grandTotal?.toString() ?? 0) - Number(a._sum.grandTotal?.toString() ?? 0))
      .slice(0, TOP_CUSTOMERS)
    const topProfiles = await this.repo.findManyByIds(topIds.map((row) => row.customerId as number))
    const profileById = new Map(topProfiles.map((row) => [row.id, row]))

    return {
      message: 'Success.CustomerReport',
      data: {
        fromDate: from,
        toDate: to,
        branchId: branchId ?? null,
        profileCount,
        activeCustomers: ids.length,
        newCustomers,
        returningCustomers,
        repeatRate: ids.length > 0 ? Number((returningCustomers / ids.length).toFixed(4)) : 0,
        topCustomers: topIds
          .map((row) => {
            const profile = profileById.get(row.customerId as number)
            // Hồ sơ đã bị xoá mềm thì không còn gì để hiện; số liệu vẫn nằm trong tổng phía trên.
            if (!profile) return null
            return {
              id: profile.id,
              name: profile.name,
              phone: profile.phone,
              orderCount: row._count._all,
              totalSpend: Number(row._sum.grandTotal?.toString() ?? 0),
            }
          })
          .filter((item): item is NonNullable<typeof item> => item !== null),
      },
    }
  }

  async updateNote(id: number, note: string | null) {
    const row = await this.repo.findById(id)
    if (!row) throw NotFoundCustomerException
    const updated = await this.repo.updateNote(id, note)
    return { message: 'Success.CustomerNoteUpdated', data: updated }
  }
}
