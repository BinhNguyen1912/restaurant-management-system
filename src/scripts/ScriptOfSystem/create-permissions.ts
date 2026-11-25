import { NestFactory } from '@nestjs/core'
import { AppModule } from '../../app.module'
import { PrismaService } from '@/shared/service/prisma.service'
import { CacheService } from '@/cache/services/cache.service'
import { CACHE_KEYS } from '@/cache/cache.constant'
import { HTTPMethod, roleName } from '@/shared/constants/role.constant'
const prisma = new PrismaService()

// CHINH SACH PHAN QUYEN
// module = doan dau cua path (/tables/getTableDetail/1 -> TABLES).
// ADMIN luon duoc toan bo permission, khong khai bao o day.
//
// Quy tac: khai bao TUONG MINH method duoc phep cho tung module.
// Khong khai bao = khong co quyen (fail closed). Truoc day chi khai bao module
// => GUEST/USER duoc ca DELETE tren CATEGORY/TABLES/TABLE-NODE/TABLE-LAYOUT.

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type RolePolicy = Record<string, Method[]>

// Nhan vien van hanh: duoc GHI tren module van hanh hang ngay,
// chi DOC tren module noi dung (menu) va ROLE, khong dung toi USERS/PERMISSIONS.
const StaffPolicy: RolePolicy = {
  AUTH: ['POST'],
  PROFILE: ['GET', 'PUT'],
  GUEST: ['GET', 'POST'],
  ORDERS: ['GET', 'POST', 'PUT'],
  TABLES: ['GET', 'POST'],
  'TABLE-NODE': ['GET', 'POST', 'PUT', 'DELETE'],
  'TABLE-LAYOUT': ['GET', 'POST', 'PUT', 'DELETE'],
  AREA: ['GET', 'POST', 'PUT', 'DELETE'],
  MESSAGES: ['GET', 'POST'],
  REMINDERS: ['GET', 'POST', 'PATCH', 'DELETE'],
  RESERVATION: ['GET', 'POST'],
  INGREDIENTS: ['GET', 'POST', 'PUT', 'DELETE'],
  RECIPES: ['GET', 'POST', 'PUT', 'DELETE'],
  UNIT: ['GET', 'POST', 'PATCH', 'DELETE'],
  'UNIT-CONVERSION': ['GET', 'POST', 'PATCH', 'DELETE'],
  MEDIA: ['POST'],
  DASHBOARD: ['POST'],
  // Ca làm việc + két tiền mặt: thu ngân mở/đóng ca và ghi thu chi trong ca của mình
  'CASH-SHIFTS': ['GET', 'POST'],
  // Nhật ký sổ cái + đối soát: dữ liệu kế toán, chỉ ADMIN (STAFF xem được ca/két của mình)
  LEDGER: [],
  // Báo cáo doanh thu (đọc projection từ sổ cái): dữ liệu tài chính, chỉ ADMIN
  REPORTS: [],
  // Đối soát lưu lịch sử: dữ liệu kế toán, chỉ ADMIN
  RECONCILIATION: [],
  // Nhật ký thao tác nhạy cảm (huỷ đơn, giảm giá, sửa giá): chỉ ADMIN, chỉ đọc
  'AUDIT-LOGS': [],
  // Quản lý voucher (tạo/sửa/tắt mã): ADMIN; khách chỉ nhập mã khi đặt món
  VOUCHERS: [],
  // Cấu hình thuế/phí của chi nhánh: STAFF chỉ ĐỌC (để FE hiện dòng VAT khi tạo đơn)
  BRANCHES: ['GET'],
  // chi doc: noi dung menu + danh muc role
  CATEGORY: ['GET'],
  'CATEGORY-TRANSLATION': ['GET'],
  PRODUCT: ['GET'],
  'PRODUCT-TRANSLATION': ['GET'],
  'MANAGE-PRODUCT': ['GET'],
  LANGUAGES: ['GET'],
  // GET /role cung la probe xac thuc cua FE /api/revalidate (xem restaurant-management-system-FE/src/app/api/revalidate/route.ts).
  // Bo dong nay => STAFF se khong revalidate duoc (403).
  ROLE: ['GET'],
}

// Ke toan: CHI DOC du lieu tai chinh. Khong tao/sua/xoa but toan, khong dung toi van hanh
// (don hang, ban, nhan vien) — ke toan sai sổ là chuyện khác với ke toan thu tien.
const AccountantPolicy: RolePolicy = {
  AUTH: ['POST'],
  // doi mat khau cua chinh minh
  PROFILE: ['GET', 'PUT'],
  // so cai + so quy + kiem tra can doi + doi soat deu nam duoi /ledger (GET)
  LEDGER: ['GET'],
  REPORTS: ['GET'],
  RECONCILIATION: ['GET'],
  // dashboard doc so lieu tong hop (POST /dashboard/indicator, GET /dashboard/overview)
  DASHBOARD: ['GET', 'POST'],
  // danh muc tai khoan ke toan: chi doc de doi chieu so
  'LEDGER-ACCOUNTS': ['GET'],
  // noi dung menu de biet mon nao ban chay (chi doc)
  PRODUCT: ['GET'],
  CATEGORY: ['GET'],
  LANGUAGES: ['GET'],
  ROLE: ['GET'],
}

// Khach da co tai khoan (User that trong bang User): tu phuc vu.
// KHONG cap ORDERS: /orders/lists tra toan bo don cua quan ly, USER khong co UI dung.
const ClientPolicy: RolePolicy = {
  AUTH: ['POST'],
  PROFILE: ['GET', 'PUT'],
  RESERVATION: ['POST'],
  // KHONG cap PAYMENT: create-url lam viec theo guestId (bang Guest), khong khop User.id.
  MESSAGES: ['GET', 'POST'],
  TABLES: ['GET'],
  'TABLE-LAYOUT': ['GET'],
  PRODUCT: ['GET'],
  CATEGORY: ['GET'],
  LANGUAGES: ['GET'],
}

// Khach quet QR tai ban. LUU Y: token cua guest mang userId = Guest.id (KHONG phai
// User.id) => KHONG duoc cap PROFILE, vi /profile tra bang User theo userId, id trung
// nhau se doc/sua duoc profile cua User khac (da xac nhan: guest id=1 doc ra admin).
const GuestPolicy: RolePolicy = {
  // KHONG cap AUTH: 5/6 route auth la @IsPublic, rieng POST /auth/logout khong public
  // nhung guest phai dung /guest/logout — neu cap AUTH thi guest token (userId = Guest.id)
  // se revoke duoc phien cua User co cung id.
  // KHONG cap RESERVATION: Reservation.userId la FK bat buoc toi bang User, con token guest
  // mang Guest.id => se ghi reservation/order vao User trung id (hoac 500 FK). Can sua schema
  // (them guestId) truoc khi mo lai.
  GUEST: ['GET', 'POST'],
  PAYMENT: ['GET', 'POST'],
  MESSAGES: ['GET', 'POST'],
  TABLES: ['GET'],
  'TABLE-LAYOUT': ['GET'],
  PRODUCT: ['GET'],
  CATEGORY: ['GET'],
  LANGUAGES: ['GET'],
}

// Module tron ca endpoint cua khach va cua quan ly, hoac endpoint lo du lieu quan ly
// (vd GET /tables tra `token` dang nhap cua ban, GET /profile tra bang User).
// Voi cac module nay CHI cap dung cac path duoi day (fail-closed).
const CustomerPathAllowlist: Record<string, string[]> = {
  GUEST: [
    '/guest/login',
    '/guest/logout',
    '/guest/refreshToken',
    '/guest/new-order',
    '/guest/orders',
    '/guest/call-staff',
    '/guest/tax-settings',
  ],
  MESSAGES: ['/messages/guest', '/messages/guest-conversation'],
  RESERVATION: ['/reservation/customer'],
  PAYMENT: ['/payment/vnpay/create-url', '/payment/vnpay/return', '/payment/vnpay/ipn'],
  TABLES: ['/tables/getTableDetail/:number'],
}

const ModulePathAllowlist: Record<string, Record<string, string[]>> = {
  GUEST: CustomerPathAllowlist,
  USER: CustomerPathAllowlist,
}

// Path bi cam du module da duoc cap.
const DenyPathByRole: Record<string, string[]> = {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  await app.init()
  const server = app.getHttpAdapter().getInstance()
  const PermissionInDB = await prisma.permission.findMany({
    where: {
      deletedAt: null,
    },
  })
  if (!server._router) {
    console.error('Không phải là Express hoặc router chưa được khởi tạo.')
    await app.close()
    return
  }

  const apiEndpoints: { method: keyof typeof HTTPMethod; path: string; name: string; module: string }[] = []

  server._router.stack
    .filter((layer) => layer.route)
    .forEach((layer) => {
      const route = layer.route
      const method = Object.keys(route.methods)[0].toUpperCase() as keyof typeof HTTPMethod
      const path = route.path
      const module = route.path.split('/')[1].toUpperCase()
      apiEndpoints.push({ method, path, name: `${method}${path}`, module })
    })

  // Bat loi chinh ta: module khai bao trong policy ma khong co trong DB => role se
  // mat quyen trong im lang. Nem loi som thay vi seed ra ket qua sai.
  // Tap module/path se ton tai sau khi insert them route moi (validate chay TRUOC khi ghi DB)
  const modulesInDB = new Set([...PermissionInDB.map((p) => p.module), ...apiEndpoints.map((e) => e.module)])
  const declaredModules = new Set([
    ...Object.keys(StaffPolicy),
    ...Object.keys(ClientPolicy),
    ...Object.keys(GuestPolicy),
    ...Object.keys(AccountantPolicy),
    ...Object.values(ModulePathAllowlist).flatMap((m) => Object.keys(m)),
  ])
  const unknownModules = [...declaredModules].filter((m) => !modulesInDB.has(m))
  if (unknownModules.length > 0) {
    throw new Error(`Module khai bao trong policy khong ton tai trong DB: ${unknownModules.join(', ')}`)
  }

  // Cung phai bat loi chinh ta o cap path: go sai 1 path trong allowlist thi module do
  // mat quyen trong im lang.
  const pathsInDB = new Set([...PermissionInDB.map((p) => p.path), ...apiEndpoints.map((e) => e.path)])
  const declaredPaths = [
    ...new Set(Object.values(ModulePathAllowlist).flatMap((m) => Object.values(m).flat())),
    ...new Set(Object.values(DenyPathByRole).flat()),
  ]
  const unknownPaths = declaredPaths.filter((path) => !pathsInDB.has(path))
  if (unknownPaths.length > 0) {
    throw new Error(`Path khai bao trong allowlist khong ton tai trong DB: ${unknownPaths.join(', ')}`)
  }

  //Tạo Object PermissionInDbMap Với key là [method, path]
  const permissionInDBMap = (await PermissionInDB).reduce((acc, permission) => {
    acc[`${permission.method}${permission.path}`] = permission
    return acc
  }, {})

  //Tạo 1 mảng object của apiEndpoints vói key là [path, method]
  const apiEndpointMap = apiEndpoints.reduce((acc, api) => {
    acc[`${api.method}${api.path}`] = api
    return acc
  }, {})

  //Lấy ra các Route trong PermissionInDb KHÔNG CÓ trong các route đang có (apiEndPoint)
  const permissionToDelete = PermissionInDB.filter((permission) => {
    return !apiEndpointMap[`${permission.method}${permission.path}`]
  })

  const resuftDelete = await prisma.permission.deleteMany({
    where: {
      id: {
        in: permissionToDelete.map((permission) => permission.id),
      },
    },
  })

  if (resuftDelete.count > 0) {
    console.log(`Deleted ${resuftDelete.count} permissions`)
  } else {
    console.log('Không có route nào được XOA.')
  }

  //Lấy ra các route trong apiEndPoint KHÔNG CÓ trong PermissionInDb
  const apiEndpointsToInsert = apiEndpoints.filter((api) => {
    return !permissionInDBMap[`${api.method}${api.path}`]
  })
  const resuftInsert = await prisma.permission.createMany({
    data: apiEndpointsToInsert.map((api) => {
      return {
        method: api.method,
        path: api.path,
        name: `${api.method}${api.path}`,
        module: api.module,
      }
    }),
    skipDuplicates: true,
  })
  if (resuftInsert.count > 0) {
    console.log(`Inserted ${resuftInsert.count} permissions`)
  } else {
    console.log('Không có route nào được Them.')
  }

  //Lay ra cac permission tren Db
  const updatedPermissions = await prisma.permission.findMany({
    where: {
      deletedAt: null,
    },
  })

  const UpdatePermissionIds = updatedPermissions.map((permission) => {
    return { id: permission.id }
  })

  if (!updatedPermissions) throw new Error('Không tìm thấy permission')

  // Loc theo chinh sach: chi lay permission co module + method duoc khai bao,
  // va loai bo cac path bi cam rieng cho role do.
  const pickByPolicy = (policy: RolePolicy, roleKey: string) => {
    const denyPaths = DenyPathByRole[roleKey] ?? []
    const pathAllowlist = ModulePathAllowlist[roleKey] ?? {}
    return updatedPermissions
      .filter((per) => {
        const allowedMethods = policy[per.module]
        if (!allowedMethods) return false
        if (!allowedMethods.includes(per.method as Method)) return false
        // module co allowlist rieng thi bat buoc path phai nam trong do
        const allowedPaths = pathAllowlist[per.module]
        if (allowedPaths && !allowedPaths.includes(per.path)) return false
        if (denyPaths.includes(per.path)) return false
        return true
      })
      .map((per) => {
        return { id: per.id }
      })
  }

  /**
   * Vai tro dat san: tao neu chua co (DB moi), roi gán quyền theo policy.
   * KHÔNG phải role hệ thống — admin vẫn sửa/xoá được trên màn hình Phân quyền; chạy lại script
   * sẽ gán lại theo policy này (script là nguồn sự thật cho quyền mặc định).
   */
  const ensureRole = async (name: string, description: string) => {
    const existing = await prisma.role.findFirst({ where: { name } })
    if (existing) return existing
    console.log(`Tao vai tro dat san: ${name}`)
    return prisma.role.create({ data: { name, description, isActive: true } })
  }

  await ensureRole('KE_TOAN', 'Kế toán — chỉ đọc sổ cái, sổ quỹ, báo cáo và đối soát')

  const AccountantPermissionIds = pickByPolicy(AccountantPolicy, 'KE_TOAN')
  const StaffPermissionIds = pickByPolicy(StaffPolicy, 'STAFF')
  const GuestPermissionIds = pickByPolicy(GuestPolicy, 'GUEST')
  const ClientPermissionIds = pickByPolicy(ClientPolicy, 'USER')

  await Promise.all([
    updateRole(UpdatePermissionIds, roleName.ADMIN),
    updateRole(StaffPermissionIds, roleName.STAFF),
    updateRole(ClientPermissionIds, roleName.USER),
    updateRole(GuestPermissionIds, roleName.GUEST),
    updateRole(AccountantPermissionIds, 'KE_TOAN'),
  ])

  // cache role 1 gio: quen xoa thi nguoi dung van dung quyen cu
  const allRoles = await prisma.role.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })
  console.log('Da cap quyen cho:', allRoles.map((role) => role.name).join(', '))

  //Sau đó thêm các quyền này vào Admin
  // const Role_admin = await prisma.role.findFirst({
  //   where: {
  //     name: roleName.ADMIN,
  //   },
  // })

  // console.log('Role_admin', Role_admin)

  // if (Role_admin) {
  //   const hihi = await prisma.role.update({
  //     where: {
  //       id: Role_admin.id,
  //       deletedAt: null,
  //     },
  //     data: {
  //       permissions: {
  //         set: updatedPermissions.map((permission) => ({ id: permission.id })),
  //       },
  //     },
  //   })
  //   console.log('Add permissions to admin', hihi)
  // }

  // Quyen vua thay doi => xoa cache role:<id> trong Redis, neu khong guard se dung
  // quyen CU toi 1 gio (chi role.service/permission.service xoa cache, script nay thi khong).
  try {
    const cacheService = app.get(CacheService)
    const roles = await prisma.role.findMany({ select: { id: true } })
    for (const role of roles) {
      await cacheService.del(CACHE_KEYS.ROLE(role.id))
    }
    console.log(`Da xoa cache role cho ${roles.length} role`)
  } catch (error) {
    // Khong de viec xoa cache lam hong script: quyen trong DB da ghi xong.
    console.error('Khong xoa duoc cache role (se het han sau 1h):', error)
  }

  await app.close()
}

const updateRole = async (UpdatePermissionIds: { id: number }[], roleName: string) => {
  const role = await prisma.role.findFirst({
    where: {
      name: roleName,
    },
  })

  console.log('Role', role)

  if (role) {
    const hihi = await prisma.role.update({
      where: {
        id: role.id,
        deletedAt: null,
      },
      data: {
        permissions: {
          set: UpdatePermissionIds,
        },
      },
    })
    console.log('Add permissions to admin', hihi)
  }
}

bootstrap()
