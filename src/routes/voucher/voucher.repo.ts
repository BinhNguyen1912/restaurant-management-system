import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { VoucherBodyType, VoucherQueryType } from '@/routes/voucher/voucher.model'

/** Đọc/ghi danh mục voucher. Không chứa luật nghiệp vụ (ở service). */
@Injectable()
export class VoucherRepo {
  constructor(private readonly prismaService: PrismaService) {}

  private buildWhere(query: VoucherQueryType): Prisma.VoucherWhereInput {
    const where: Prisma.VoucherWhereInput = { deletedAt: null }
    if (query.status) where.status = query.status
    if (query.search) {
      // tìm gần đúng theo mã, không phân biệt hoa thường
      where.code = { contains: query.search.toUpperCase(), mode: 'insensitive' }
    }
    return where
  }

  async list(query: VoucherQueryType) {
    const where = this.buildWhere(query)
    const [rows, totalItems] = await Promise.all([
      this.prismaService.voucher.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { _count: { select: { voucherSnapshots: true } } },
      }),
      this.prismaService.voucher.count({ where }),
    ])

    return {
      rows: rows.map((row) => ({
        ...row,
        usedCount: row._count.voucherSnapshots,
      })),
      totalItems,
    }
  }

  findById(id: number) {
    return this.prismaService.voucher.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { voucherSnapshots: true } } },
    })
  }

  /** tìm cả mã đã xoá mềm: cột `code` là unique ở DB nên phải kiểm cả row đã xoá, nếu không sẽ nổ P2002 */
  findAnyByCode(code: string) {
    return this.prismaService.voucher.findFirst({ where: { code: code.trim().toUpperCase() } })
  }

  create(data: VoucherBodyType & { createdById: number }) {
    const { createdById, code, ...rest } = data
    return this.prismaService.voucher.create({
      data: {
        ...rest,
        // mã chuẩn hoá về chữ HOA để khách nhập kiểu gì cũng khớp
        code: code.trim().toUpperCase(),
        usageLimit: rest.usageLimit ?? null,
        createdById,
      },
      include: { _count: { select: { voucherSnapshots: true } } },
    })
  }

  update(id: number, data: VoucherBodyType & { updatedById: number }) {
    const { updatedById, code, ...rest } = data
    return this.prismaService.voucher.update({
      where: { id },
      data: {
        ...rest,
        code: code.trim().toUpperCase(),
        // chỉ ghi usageLimit khi client thực sự gửi lên, tránh PUT thiếu field làm mất giới hạn lượt
        ...('usageLimit' in rest ? { usageLimit: rest.usageLimit ?? null } : {}),
        updatedById,
      },
      include: { _count: { select: { voucherSnapshots: true } } },
    })
  }

  updateStatus(id: number, status: 'ACTIVE' | 'INACTIVE', updatedById: number) {
    return this.prismaService.voucher.update({
      where: { id },
      data: { status, updatedById },
      include: { _count: { select: { voucherSnapshots: true } } },
    })
  }

  /** xoá mềm: bút toán/đơn cũ vẫn trỏ tới voucherSnapshots, không được xoá cứng */
  softDelete(id: number, deletedById: number) {
    // Voucher không có cột deletedById -> ghi người xoá vào updatedById
    return this.prismaService.voucher.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: deletedById, status: 'INACTIVE' },
    })
  }
}
