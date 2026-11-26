import envConfig from '@/shared/config'
import { roleName } from '@/shared/constants/role.constant'
import { HashingService } from '@/shared/service/hashing.service'
import { PrismaService } from '@/shared/service/prisma.service'

/**
 * Seed NỀN: 4 vai trò hệ thống + tài khoản admin đầu tiên.
 *
 * **Idempotent** (sửa lại để deploy được nhiều lần): trước đây script `throw` khi đã có role, nên
 * chạy trong pipeline deploy lần 2 là đỏ — và người ta sẽ bỏ luôn bước seed khỏi deploy. Giờ:
 *  - role nào thiếu thì tạo, có rồi thì bỏ qua
 *  - admin tạo theo `Admin_email` nếu email đó chưa tồn tại; mật khẩu KHÔNG bị ghi đè (tránh
 *    vô tình reset mật khẩu admin thật mỗi lần deploy)
 */
const prisma = new PrismaService()
const main = async () => {
  const systemRoles = [
    { name: roleName.ADMIN, description: 'Toàn quyền quản lý hệ thống' },
    { name: roleName.STAFF, description: 'Quyền hạn của nhân viên' },
    { name: roleName.USER, description: 'Quyền hạn của người dùng' },
    { name: roleName.GUEST, description: 'Quyền hạn của khách vãng lai' },
  ]

  let rolesCreated = 0
  for (const role of systemRoles) {
    const existing = await prisma.role.findFirst({ where: { name: role.name }, select: { id: true } })
    if (existing) continue
    await prisma.role.create({ data: role })
    rolesCreated += 1
  }

  const adminRole = await prisma.role.findFirstOrThrow({ where: { name: roleName.ADMIN } })

  const existingAdmin = await prisma.user.findFirst({
    where: { email: envConfig.Admin_email },
    select: { id: true, email: true },
  })
  if (existingAdmin) {
    console.log(`Admin đã tồn tại (${existingAdmin.email}) — bỏ qua, KHÔNG đổi mật khẩu.`)
    return { rolesCreated, admin: existingAdmin, created: false }
  }

  const hashsing = new HashingService()
  const admin = await prisma.user.create({
    data: {
      email: envConfig.Admin_email,
      name: envConfig.Admin_name,
      password: await hashsing.hashPassword(envConfig.Admin_password),
      roleId: adminRole.id,
    },
  })

  return { rolesCreated, admin, created: true }
}

main()
  .then(async ({ admin, rolesCreated, created }) => {
    console.log(
      created
        ? `Đã tạo admin ${admin.email} (mật khẩu lấy từ Admin_password) và ${rolesCreated} vai trò.`
        : `Không tạo admin mới (đã có). Vai trò tạo thêm: ${rolesCreated}.`,
    )
  })
  .catch((error) => {
    throw error
  })
