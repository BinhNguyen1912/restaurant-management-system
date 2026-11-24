import { BadRequestException } from '@nestjs/common'
import { PrismaService } from '@/shared/service/prisma.service'
import { roleName } from '@/shared/constants/role.constant'

type PrismaLike = {
  user: { findUnique: (args: any) => Promise<{ branchId: number | null } | null> }
  guest: { findUnique: (args: any) => Promise<{ tableNode: { branchId: number } | null } | null> }
  branch: { findFirst: (args: any) => Promise<{ id: number } | null> }
}

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

/**
 * Xac dinh chi nhanh cho 1 thao tac (ADR 0001 D4).
 *
 * QUAN TRONG: `userId` trong token **không** phải lúc nào cũng là `User.id`:
 * token của khách (guest) mang `userId = Guest.id`. Nếu tra thẳng bảng `User` bằng id đó
 * thì có thể khớp sang một nhân viên khác và trả về **nhầm chi nhánh** (lỗi im lặng,
 * chỉ lộ khi có ≥ 2 chi nhánh). Vì vậy phải truyền `roleName` để chọn đúng bảng:
 *  - GUEST  -> Guest.id -> TableNode.branchId (bàn khách đang ngồi)
 *  - còn lại -> User.branchId
 *
 * Fallback: chi nhánh active đầu tiên.
 */
/**
 * Chi nhanh cua 1 khach (Guest) = chi nhanh cua ban khach dang ngoi.
 * Dung cho endpoint do khach goi (token GUEST mang `userId = Guest.id`) de khong tra nham bang `User`.
 */
export async function resolveBranchIdByGuest(
  prisma: { guest: { findUnique: (args: any) => Promise<any> } },
  guestId: number,
): Promise<number> {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { tableNode: { select: { branchId: true } } },
  })
  if (!guest) throw new BadRequestException(`Không tìm thấy khách #${guestId}`)
  if (!guest.tableNode) throw new BadRequestException(`Khách #${guestId} chưa gắn với bàn nào nên không xác định được chi nhánh`)
  return guest.tableNode.branchId
}

export async function resolveBranchId(
  prisma: PrismaService | PrismaLike,
  options: { userId?: number | null; roleName?: string | null } = {},
): Promise<number> {
  const client = prisma as PrismaLike
  const isGuestToken = options.roleName === roleName.GUEST

  if (options.userId) {
    if (isGuestToken) {
      const guest = await client.guest.findUnique({
        where: { id: options.userId },
        select: { tableNode: { select: { branchId: true } } },
      })
      if (guest?.tableNode?.branchId) return guest.tableNode.branchId
    } else {
      const user = await client.user.findUnique({
        where: { id: options.userId },
        select: { branchId: true },
      })
      if (user?.branchId) return user.branchId
    }
  }

  const branch = await client.branch.findFirst({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true },
  })

  if (!branch) throw new BadRequestException('Chưa cấu hình chi nhánh nào. Tạo Branch trước khi tạo dữ liệu.')
  return branch.id
}
