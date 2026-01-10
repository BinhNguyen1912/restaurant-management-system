import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { OrderStatus } from '@/shared/constants/order.constant'
import { formatInTimeZone } from 'date-fns-tz'
import { ProductIndicatorType } from '@/routes/dashboard/dashboard-indicator.dto'
import { DashboardIndicatorQueryType, DashboardIndicatorType } from '@/routes/dashboard/dashboard.model'

@Injectable()
export class DashboardIndicatorService {
  constructor(private readonly prismaService: PrismaService) {}

  async getDashboardIndicator({ fromDate, toDate }: DashboardIndicatorQueryType): Promise<DashboardIndicatorType> {
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

    // Doanh thu
    let revenue = 0
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

    // Doanh thu theo ngày
    const revenueByDateObj: { [key: string]: number } = {}

    // Lặp từ fromDate -> toDate để tạo object với key là ngày
    const currentDate = new Date(fromDateObj)
    while (currentDate <= toDateObj) {
      const dateKey = formatInTimeZone(currentDate, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy')
      revenueByDateObj[dateKey] = 0
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Số lượng bàn đang được sử dụng
    const tableNumberObj: { [key: number]: boolean } = {}

    orders.forEach((order) => {
      if (order.status === OrderStatus.PAID) {
        // Tính doanh thu từ các items trong order
        const orderRevenue = order.items.reduce((total, item) => {
          return total + item.skuPrice * item.quantity
        }, 0)

        revenue += orderRevenue

        // Cập nhật số lượng đặt thành công cho từng sản phẩm
        order.items.forEach((item) => {
          if (item.productId && productIndicatorObj[item.productId]) {
            productIndicatorObj[item.productId].successOrders += item.quantity
          }
        })

        // Doanh thu theo ngày
        const date = formatInTimeZone(order.createdAt, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy')
        revenueByDateObj[date] = (revenueByDateObj[date] ?? 0) + orderRevenue
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
    const revenueByDate = Object.keys(revenueByDateObj).map((date) => ({
      date,
      revenue: revenueByDateObj[date],
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
