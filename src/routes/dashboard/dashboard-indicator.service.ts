import { Prisma } from '@prisma/client'
import { addRevenueByDate, revenueByDateToNumbers } from '@/routes/dashboard/dashboard-money'
import { resolveBranchScope } from '@/shared/service/branch.resolver'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { OrderStatus } from '@/shared/constants/order.constant'
import { formatInTimeZone } from 'date-fns-tz'
import { ProductIndicatorType } from '@/routes/dashboard/dashboard-indicator.dto'
import { DashboardIndicatorQueryType, DashboardIndicatorType } from '@/routes/dashboard/dashboard.model'
import { ReportsService } from '@/routes/reports/reports.service'

@Injectable()
export class DashboardIndicatorService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  /**
   * Tổng quan cho Dashboard. Người dùng thấy 4 ô tiền + so sánh, nên chỉ cần 1 request thay vì
   * FE tự gọi báo cáo 3 lần (kỳ này, kỳ trước, cùng kỳ tháng trước).
   */
  async getOverview(
    query: { fromDate?: string; toDate?: string },
    actor?: { userId?: number; roleName?: string },
  ) {
    return await this.reportsService.overview(query, {
      userId: actor?.userId ?? null,
      roleName: actor?.roleName ?? null,
    })
  }

  async getDashboardIndicator(
    { fromDate, toDate }: DashboardIndicatorQueryType,
    actor?: { userId?: number; roleName?: string },
  ): Promise<DashboardIndicatorType> {
    // ADMIN là cấp tổng: không chọn chi nhánh thì số liệu là TỔNG mọi chi nhánh.
    // Người khác luôn bị ép về chi nhánh của mình (resolveBranchScope lo việc đó).
    const branchId = await resolveBranchScope(this.prismaService, {
      userId: actor?.userId,
      roleName: actor?.roleName,
    })
    const fromDateObj = fromDate ? new Date(fromDate) : new Date()
    const toDateObj = toDate ? new Date(toDate) : new Date()
    const [orders, guests, products] = await Promise.all([
      this.prismaService.order.findMany({
        include: {
          items: {
            include: {
              product: true,
              sku: true,
            },
          },
          tableNode: true,
          payment: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        where: {
          createdAt: {
            gte: fromDateObj,
            lte: toDateObj,
          },
          deletedAt: null,
          ...(branchId ? { branchId } : {}),
        },
      }) as any,
      this.prismaService.guest.findMany({
        where: {
          createdAt: {
            gte: fromDateObj,
            lte: toDateObj,
          },
          deletedAt: null,
          orders: {
            some: {
              status: OrderStatus.PAID,
              deletedAt: null,
              ...(branchId ? { branchId } : {}),
            },
          },
        },
      }) as any,
      this.prismaService.product.findMany({
        where: {
          deletedAt: null,
        },
      }) as any,
    ])

    // Doanh thu: đọc từ projection `DailyBranchSummary` (nguồn: sổ cái), KHÔNG cộng Order nữa.
    // Contract endpoint giữ nguyên để FE không vỡ.
    const report = await this.reportsService.revenue({ fromDate, toDate, branchId }, actor)
    const revenue = report.totals.grandTotal
    // Số lượng khách gọi món thành công
    const guestCount = guests.length
    // Số lượng đơn
    const orderCount = orders.length

    // Thống kê sản phẩm
    const productIndicatorObj: Record<number, ProductIndicatorType> = products.reduce(
      (acc, product) => {
        acc[product.id] = {
          ...product,
          successOrders: 0,
        }
        return acc
      },
      {} as Record<number, ProductIndicatorType>,
    )

    // Doanh thu theo ngày lấy từ cùng bảng projection (khớp đúng số của báo cáo)
    const revenueByDateObj: { [key: string]: Prisma.Decimal } = {}

    // Lặp từ fromDate -> toDate để tạo object với key là ngày (ngày không có đơn vẫn hiện 0)
    const currentDate = new Date(fromDateObj)
    while (currentDate <= toDateObj) {
      const dateKey = formatInTimeZone(currentDate, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy')
      revenueByDateObj[dateKey] = new Prisma.Decimal(0)
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // projection trả ngày dạng yyyy-MM-dd; dashboard dùng dd/MM/yyyy
    for (const row of report.rows) {
      const [year, month, day] = row.date.split('-')
      addRevenueByDate(revenueByDateObj, `${day}/${month}/${year}`, new Prisma.Decimal(row.grandTotal))
    }

    // Số lượng bàn đang được sử dụng
    const tableNumberObj: { [key: number]: boolean } = {}

    orders.forEach((order) => {
      if (order.status === OrderStatus.PAID) {
        // Cập nhật số lượng đặt thành công cho từng sản phẩm
        order.items.forEach((item) => {
          if (item.productId && productIndicatorObj[item.productId]) {
            productIndicatorObj[item.productId].successOrders += item.quantity
          }
        })

      }

      // Kiểm tra bàn đang sử dụng
      if (
        [
          OrderStatus.PENDING,
          OrderStatus.CONFIRMED,
          OrderStatus.PREPARING,
          OrderStatus.READY,
          OrderStatus.COMPLETED,
          OrderStatus.PAID,
          OrderStatus.CANCELLED,
        ].includes(order.status) &&
        order.tableNodeId !== null
      ) {
        tableNumberObj[order.tableNodeId] = true
      }
    })

    // Số lượng bàn đang sử dụng
    const servingTableCount = Object.keys(tableNumberObj).length

    // Doanh thu theo ngày
    const revenueByDateNumbers = revenueByDateToNumbers(revenueByDateObj)
    const revenueByDate = Object.keys(revenueByDateNumbers).map((date) => ({
      date,
      revenue: revenueByDateNumbers[date],
    }))

    const productIndicator = Object.values(productIndicatorObj)

    return {
      revenue,
      guestCount,
      orderCount,
      servingTableCount,
      productIndicator,
      revenueByDate,
    } as any
  }
}
