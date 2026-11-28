import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { PrismaService } from '@/shared/service/prisma.service'
import { resolveBranchScope } from '@/shared/service/branch.resolver'
import { SYSTEM_TIME_ZONE } from '@/shared/config/timezone'
import { resolveRange } from '@/routes/reports/revenue-summary'
import { computeOrderMoney } from '@/shared/service/order-money'
import { AuditLogService } from '@/shared/service/audit-log.service'
import { OrderStatus, PaymentStatus } from '@/shared/constants/order.constant'
import { CustomerRepo } from '@/routes/customer/customer.repo'
import {
  CustomerListQueryType,
  CustomerRedeemPointsType,
  CustomerReportQueryType,
} from '@/routes/customer/customer.model'
import {
  checkRedeemable,
  earnedPointsForOrder,
  maxRedeemablePoints,
  MIN_REDEEM_POINTS,
  POINT_VALUE_VND,
  redeemableBalance,
  VND_PER_POINT,
} from '@/routes/customer/customer.point-policy'

const TOP_CUSTOMERS = 10
const RECENT_ORDERS = 10
const RECENT_RESERVATIONS = 10
const OPEN_ORDERS = 20
const POINT_HISTORY = 30

const NotFoundCustomerException = new NotFoundException({ message: 'Error.NotFoundCustomer', path: 'id' })

/** Đơn đã chốt tiền thì không được trừ điểm nữa (cùng luật với sửa số lượng/giảm giá ở updateOrder). */
const CLOSED_ORDER_STATUS: string[] = [OrderStatus.PAID, OrderStatus.COMPLETED, OrderStatus.CANCELLED]

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
    private readonly auditLog: AuditLogService,
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
    points: { earned: number; spent: number },
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
      points: this.toPoints(points),
    }
  }

  /** Ba con số của điểm + chính sách hiện hành (client hiển thị đúng luật, không tự đoán tỉ giá). */
  private toPoints({ earned, spent }: { earned: number; spent: number }) {
    return {
      earned,
      spent,
      balance: redeemableBalance(earned, spent),
      vndPerPoint: VND_PER_POINT,
      pointValueVnd: POINT_VALUE_VND,
      minRedeemPoints: MIN_REDEEM_POINTS,
    }
  }

  async list(query: CustomerListQueryType, actor: AccessTokenPayload) {
    const branchId = await this.scopeBranch(query, actor)
    const [rows, totalItems] = await this.repo.list(query)
    const ids = rows.map((row) => row.id)
    // Điểm là con số của KHÁCH (mọi chi nhánh), không cắt theo chi nhánh như tiền — một khách chỉ
    // có một số dư, đổi ở chi nhánh nào cũng trừ đúng số đó.
    const [{ orders, reservationCounts }, earned, spent] = await Promise.all([
      this.repo.stats(ids, branchId),
      this.repo.earnedPoints(ids),
      this.repo.spentPoints(ids),
    ])
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
      data: rows.map((row) =>
        this.toCustomer(row, statsById.get(row.id), reservationCounts.get(row.id) ?? 0, {
          earned: earned.get(row.id) ?? 0,
          spent: spent.get(row.id) ?? 0,
        }),
      ),
      totalItems,
      page: query.page,
      limit: query.limit,
    }
  }

  async detail(id: number, actor: AccessTokenPayload) {
    const branchId = await this.scopeBranch({}, actor)
    const row = await this.repo.findById(id)
    if (!row) throw NotFoundCustomerException

    const [{ orders, reservationCounts }, recentOrders, recentReservations, points] = await Promise.all([
      this.repo.stats([id], branchId),
      this.repo.recentOrders(id, branchId, RECENT_ORDERS),
      this.repo.recentReservations(id, branchId, RECENT_RESERVATIONS),
      this.repo.pointBalance(id),
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
      points,
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

  /**
   * Đơn còn trừ được điểm của khách — nguồn cho danh sách chọn khi đổi điểm.
   *
   * Không lọc từ "10 đơn gần nhất" của hồ sơ: khách ăn nhiều thì đơn đang mở đã rơi khỏi danh sách
   * đó và nhân viên không còn gì để chọn, dù hệ thống vẫn cho đổi.
   */
  async openOrders(customerId: number, actor: AccessTokenPayload) {
    const row = await this.repo.findById(customerId)
    if (!row) throw NotFoundCustomerException
    const branchId = await this.scopeBranch({}, actor)
    const orders = await this.repo.openOrders(customerId, branchId, OPEN_ORDERS)
    return {
      message: 'Success.CustomerOpenOrders',
      data: orders.map((order) => {
        const payable = order.subtotal.minus(order.discountTotal)
        return {
          id: order.id,
          status: order.status,
          grandTotal: order.grandTotal,
          payable,
          maxRedeemPoints: maxRedeemablePoints(payable),
          branchName: order.branch.name,
          tableName: order.tableNode?.name ?? null,
          createdAt: order.createdAt,
        }
      }),
    }
  }

  /**
   * Số dư điểm + lịch sử (kiếm và đổi trộn theo thời gian).
   *
   * Điểm KHÔNG cắt theo chi nhánh như tiền: một khách một số dư, đổi ở chi nhánh nào cũng trừ
   * đúng số đó. Vì vậy lịch sử có thể nhắc đơn ở chi nhánh khác — đó là điểm của chính khách.
   */
  async points(customerId: number) {
    const row = await this.repo.findById(customerId)
    if (!row) throw NotFoundCustomerException
    const [balance, history] = await Promise.all([this.repo.pointBalance(customerId), this.pointHistory(customerId)])
    return { message: 'Success.CustomerPoints', data: { ...this.toPoints(balance), history } }
  }

  /** Lịch sử điểm = đơn đã thu tiền (kiếm) ∪ các lần đổi (dùng), sắp mới nhất trước. */
  private async pointHistory(customerId: number) {
    const [orders, redemptions] = await Promise.all([
      this.repo.paidOrdersForPoints(customerId, POINT_HISTORY),
      this.repo.redemptions(customerId, POINT_HISTORY),
    ])
    const earned = orders.map((order) => ({
      type: 'EARNED' as const,
      at: order.createdAt,
      points: earnedPointsForOrder(order.grandTotal),
      orderId: order.id,
      amount: Number(order.grandTotal.toString()),
      branchName: order.branch.name,
    }))
    const spent = redemptions.map((redemption) => ({
      type: 'REDEEMED' as const,
      at: redemption.createdAt,
      points: redemption.points,
      orderId: redemption.orderId,
      valueVnd: Number(redemption.valueVnd.toString()),
      voided: redemption.voidedAt !== null,
    }))
    return [...earned, ...spent].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, POINT_HISTORY)
  }

  /**
   * Đổi điểm thành giảm giá trên MỘT hoá đơn CHƯA thu tiền của chính khách đó.
   *
   * Cả cụm nằm trong một transaction: khoá hồ sơ (chống hai request đồng thời cùng vượt số dư),
   * đọc số dư, tính lại tiền đơn bằng `computeOrderMoney` (cùng hàm với lúc tạo/sửa đơn — không tự
   * nhân chia lại thuế/phí ở đây), cập nhật `Payment.amount`, ghi `PointRedemption` và audit.
   */
  async redeemPoints(customerId: number, body: CustomerRedeemPointsType, actor: AccessTokenPayload) {
    const branchId = await this.scopeBranch({}, actor)
    return await this.prismaService.$transaction(async (tx) => {
      if (!(await this.repo.lockCustomer(tx, customerId))) throw NotFoundCustomerException

      const balanceNow = await this.repo.pointBalance(customerId, tx)
      const balance = redeemableBalance(balanceNow.earned, balanceNow.spent)
      const check = checkRedeemable({ balance, points: body.points })
      if (!check.ok) throw new BadRequestException({ message: check.message, ...(check.params ?? {}) })

      const order = await this.repo.openOrderForPoints(tx, body.orderId, customerId, branchId)
      if (!order) {
        throw new BadRequestException({ message: 'Error.OrderNotEligibleForPoints', path: 'orderId' })
      }
      // Đơn đã chốt tiền (hoặc đã huỷ) thì trừ điểm là sửa số liệu đã thu — cùng luật với
      // `updateOrder`, nơi mọi thay đổi tiền trên đơn đã trả đều bị chặn.
      if (CLOSED_ORDER_STATUS.includes(order.status) || order.payment?.status !== PaymentStatus.PENDING) {
        throw new BadRequestException({ message: 'Error.OrderAlreadyPaidCannotChangeMoney', path: 'orderId' })
      }

      // Đơn không có dòng món thì KHÔNG tính lại được tiền: `computeOrderMoney` lấy `items` làm
      // gốc, nên với đơn rỗng nó ra subtotal = 0 và hoá đơn thành 0 đồng. Từ chối thay vì phá đơn.
      if (order.items.length === 0) {
        throw new BadRequestException({ message: 'Error.OrderNotEligibleForPoints', path: 'orderId' })
      }

      // Không đổi quá số tiền còn phải trả: đổi 100 điểm cho hoá đơn 50.000đ thì phần dư bốc hơi
      // mà khách vẫn mất điểm.
      const payable = new Prisma.Decimal(order.subtotal).minus(order.discountTotal)
      const value = new Prisma.Decimal(check.valueVnd)
      if (payable.lessThanOrEqualTo(0) || value.greaterThan(payable)) {
        throw new BadRequestException({
          message: 'Error.PointsExceedOrderTotal',
          maxPoints: maxRedeemablePoints(payable),
        })
      }

      const money = computeOrderMoney({
        lines: order.items.map((item) => ({ price: item.skuPrice, quantity: item.quantity })),
        discountTotal: new Prisma.Decimal(order.discountTotal).plus(value),
        taxRate: order.taxRate,
        serviceChargeRate: order.serviceChargeRate,
        pricesIncludeTax: order.branch.pricesIncludeTax,
      })

      await tx.order.update({
        where: { id: order.id },
        data: {
          subtotal: money.subtotal,
          discountTotal: money.discountTotal,
          serviceChargeAmount: money.serviceChargeAmount,
          taxTotal: money.taxTotal,
          grandTotal: money.grandTotal,
        },
      })
      // Đơn đặt cọc: Payment đang giữ đúng số tiền CỌC (tạo lúc đặt bàn), không phải tổng đơn —
      // ghi đè bằng tổng mới là làm hỏng phép đối chiếu số phải thu lúc thanh toán. Phần còn lại
      // được thu bằng Payment khác, nên ở đây chỉ cần tiền đơn đúng.
      const deposit = order.reservation?.depositAmount ?? 0
      if (deposit <= 0) {
        await tx.payment.update({ where: { id: order.paymentId }, data: { amount: money.grandTotal } })
      }

      const reason = body.reason?.trim() || `Đổi ${body.points} điểm`
      const redemption = await tx.pointRedemption.create({
        data: { customerId, points: body.points, valueVnd: value, orderId: order.id, reason, createdById: actor.userId },
        select: { id: true },
      })

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roleName,
          action: 'POINTS_REDEEMED',
          entityType: 'ORDER',
          entityId: order.id,
          before: {
            grandTotal: order.grandTotal.toString(),
            discountTotal: order.discountTotal.toString(),
          },
          after: {
            grandTotal: money.grandTotal.toString(),
            discountTotal: money.discountTotal.toString(),
            points: body.points,
            valueVnd: check.valueVnd,
          },
          reason,
          branchId: order.branchId,
        },
        tx,
      )

      return {
        message: 'Success.CustomerPointsRedeemed',
        data: {
          redemptionId: redemption.id,
          points: body.points,
          valueVnd: check.valueVnd,
          orderId: order.id,
          orderGrandTotal: Number(money.grandTotal.toString()),
          balance: balance - body.points,
        },
      }
    })
  }
}
