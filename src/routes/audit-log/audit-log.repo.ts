import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@/shared/service/prisma.service'
import { AuditLogQueryType } from '@/routes/audit-log/audit-log.model'

@Injectable()
export class AuditLogRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async list(query: AuditLogQueryType) {
    const where: Prisma.AuditLogWhereInput = {}
    if (query.action) where.action = query.action
    if (query.entityType) where.entityType = query.entityType
    if (query.entityId) where.entityId = query.entityId
    if (query.actorId) where.actorId = query.actorId
    if (query.branchId) where.branchId = query.branchId
    if (query.fromDate || query.toDate) {
      const createdAt: Prisma.DateTimeFilter = {}
      // biên ngày theo giờ VN (UTC+7), giống báo cáo doanh thu
      if (query.fromDate) createdAt.gte = new Date(`${query.fromDate}T00:00:00.000+07:00`)
      if (query.toDate) createdAt.lte = new Date(`${query.toDate}T23:59:59.999+07:00`)
      where.createdAt = createdAt
    }

    const [rows, totalItems] = await Promise.all([
      this.prismaService.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prismaService.auditLog.count({ where }),
    ])

    // tên người thao tác: gom 1 query, không join N lần
    const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is number => id !== null))]
    const actors = actorIds.length
      ? await this.prismaService.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : []
    const actorById = new Map(actors.map((actor) => [actor.id, actor]))

    return {
      data: rows.map((row) => ({
        ...row,
        actorName: row.actorId ? (actorById.get(row.actorId)?.name ?? actorById.get(row.actorId)?.email ?? null) : null,
      })),
      totalItems,
    }
  }
}
