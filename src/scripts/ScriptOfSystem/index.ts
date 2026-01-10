import envConfig from '@/shared/config'
import { roleName } from '@/shared/constants/role.constant'
import { HashingService } from '@/shared/service/hashing.service'
import { PrismaService } from '@/shared/service/prisma.service'

const prisma = new PrismaService()
const main = async () => {
  const roleCount = await prisma.role.count()
  if (roleCount > 0) {
    throw new Error('Adreal have roles')
  }
  const roles = await prisma.role.createMany({
    data: [
      {
        name: roleName.ADMIN,
        description: 'Toàn quyền quản lý hệ thống',
      },
      {
        name: roleName.STAFF,
        description: 'Quyền hạn của nhân viên',
      },
      {
        name: roleName.USER,
        description: 'Quyền hạn của người dùng',
      },
      {
        name: roleName.GUEST,
        description: 'Quyền hạn của khách vãng lai',
      },
    ],
  })

  //Lấy ra Role id cua Admin
  const adminRole = await prisma.role.findFirstOrThrow({
    where: {
      name: roleName.ADMIN,
    },
  })
  const hashsing = new HashingService()
  const admin = await prisma.user.create({
    data: {
      email: envConfig.Admin_email,
      name: envConfig.Admin_name,
      password: await hashsing.hashPassword(envConfig.Admin_password),
      roleId: adminRole.id,
    },
  })

  return { roles, admin }
}

main()
  .then(async ({ admin, roles }) => {
    console.log(
      `Đã tạo xong ban đầu với tài khoản Admin: ${admin.email} - Mật khẩu: ${envConfig.Admin_password} và các role: ${roles.count}`,
    )
    console.log(`Đã tạo ra ${roles.count} role`)
  })
  .catch((error) => {
    throw error
  })
