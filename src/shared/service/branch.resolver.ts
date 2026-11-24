import { BadRequestException } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'

type PrismaLike = {
  user: { findUnique: (args: any) => Promise<{ branchId: number | null } | null> }
  branch: { findFirst: (args: any) => Promise<{ id: number } | null> }
}

/**
 * Xac dinh chi nhanh cho 1 ban ghi moi (ADR 0001 D4).
 *
 * Thu tu: chi nhanh cua nguoi tao (User.branchId) -> chi nhanh active dau tien.
 * Giai doan 1 chi co 1 chi nhanh that; khi mo chi nhanh thu 2 thi gan User.branchId
 * cho tung nhan vien la du, khong phai sua code.
 */
/**
 * Chi nhanh cua 1 ban (TableNode) — dung cho du lieu gan voi ban (don tai ban, reservation).
 * Dat truoc: ban thuoc chi nhanh nao thi du lieu thuoc chi nhanh do.
 */
export async function resolveBranchIdByTableNode(
  prisma: { tableNode: { findUnique: (args: any) => Promise<{ branchId: number } | null> } },
  tableNodeId: number,
): Promise<number> {
  const tableNode = await prisma.tableNode.findUnique({
    where: { id: tableNodeId },
    select: { branchId: true },
  })
  if (!tableNode) throw new BadRequestException(`Không tìm thấy bàn #${tableNodeId}`)
  return tableNode.branchId
}

export async function resolveBranchId(
  prisma: PrismaService | PrismaLike,
  options: { userId?: number | null } = {},
): Promise<number> {
  const client = prisma as PrismaLike

  if (options.userId) {
    const user = await client.user.findUnique({
      where: { id: options.userId },
      select: { branchId: true },
    })
    if (user?.branchId) return user.branchId
  }

  const branch = await client.branch.findFirst({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true },
  })

  if (!branch) throw new BadRequestException('Chưa cấu hình chi nhánh nào. Tạo Branch trước khi tạo dữ liệu.')
  return branch.id
}
