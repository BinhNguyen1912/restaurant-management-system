import { NestFactory } from '@nestjs/core'
import { AppModule } from '../../app.module'
import { PrismaService } from '@/shared/service/prisma.service'
import { HTTPMethod, roleName } from '@/shared/constants/role.constant'
const prisma = new PrismaService()

const StaffModule = ['AUTH', 'PROFILE', 'CATEGORY', 'CATEGORY-TRANSLATION']
const ClientModule = ['AUTH', 'PROFILE']
const GuestModule = ['AUTH', 'PROFILE']
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
  const StaffPermissionIds = updatedPermissions
    .filter((per) => StaffModule.includes(per.module))
    .map((per) => {
      return { id: per.id }
    })
  const GuestPermissionIds = updatedPermissions
    .filter((per) => GuestModule.includes(per.module))
    .map((per) => {
      return { id: per.id }
    })
  const ClientPermissionIds = updatedPermissions
    .filter((per) => ClientModule.includes(per.module))
    .map((per) => {
      return { id: per.id }
    })

  await Promise.all([
    updateRole(UpdatePermissionIds, roleName.ADMIN),
    updateRole(StaffPermissionIds, roleName.STAFF),
    updateRole(ClientPermissionIds, roleName.USER),
    updateRole(GuestPermissionIds, roleName.GUEST),
  ])

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
