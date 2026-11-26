import { PrismaClient, ProductStatus, SKUStatus, UserStatus } from '@prisma/client'
import { HashingService } from '@/shared/service/hashing.service'
import { BRANCHES, CATEGORIES, DISHES, EMPLOYEE_NAMES, ACCOUNTANT_NAMES, INGREDIENTS, SUPPLIERS } from './names'

/**
 * Dựng bộ dữ liệu Việt Nam dùng được thật: 3 chi nhánh, nhân viên, thực đơn, bàn, nguyên liệu,
 * định lượng và phiếu nhập hàng.
 *
 * Nguyên tắc:
 *  - **Không** tạo bản ghi có dấu vết demo/e2e trong tên, email, mã.
 *  - **Idempotent**: tìm theo khoá tự nhiên (code chi nhánh, email, tên món, tên nguyên liệu).
 *  - Mọi tài khoản dùng email `…@order.com`, mật khẩu `123456` như yêu cầu.
 *  - Nhân viên **bắt buộc** có chi nhánh (ràng buộc mới); nhập hàng đi qua đúng logic nghiệp vụ
 *    (cộng dồn tồn, bình quân giá quyền) để số liệu nhất quán với app.
 *
 * Chạy: npx ts-node -r tsconfig-paths/register src/scripts/data/init-vietnam-data.ts
 */
const prisma = new PrismaClient()
const hashing = new HashingService()
const PASSWORD = '123456'

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = <T>(list: T[]) => list[rand(0, list.length - 1)]
const round = (value: number) => Math.round(value * 100) / 100

/** Bỏ dấu tiếng Việt để tạo email */
const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')


/** Dọn dấu vết của các lần thử/e2e trước: role rác, tài khoản không phải @order.com, món trùng, bàn dư */
async function cleanupLegacy(adminId: number) {
  const removed: Record<string, number> = {}

  // 1. Role rác (không phải role hệ thống, không phải KE_TOAN, không có user)
  const keepRoles = ['ADMIN', 'STAFF', 'USER', 'GUEST', 'KE_TOAN']
  const junkRoles = await prisma.role.findMany({
    where: { name: { notIn: keepRoles } },
    select: { id: true, name: true, _count: { select: { users: true } } },
  })
  for (const role of junkRoles) {
    if (role._count.users > 0) continue
    await prisma.role.delete({ where: { id: role.id } })
    removed.roleRac = (removed.roleRac ?? 0) + 1
  }

  // 2. Tài khoản không thuộc bộ dữ liệu này (e2e/verify/kt…) -> xoá mềm để không vỡ khoá ngoại
  const oddUsers = await prisma.user.findMany({
    where: { deletedAt: null, email: { not: { endsWith: '@order.com' } }, id: { not: adminId } },
    select: { id: true },
  })
  for (const user of oddUsers) {
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date(), deletedById: adminId } })
    removed.taiKhoanCu = (removed.taiKhoanCu ?? 0) + 1
  }

  // 2b. Người trùng (cùng tên + cùng chi nhánh) do lần chạy trước tạo thêm -> xoá mềm bản thừa
  const allUsers = await prisma.user.findMany({
    where: { deletedAt: null, email: { endsWith: '@order.com' }, id: { not: adminId } },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, branchId: true },
  })
  const seen = new Set<string>()
  for (const user of allUsers) {
    const key = `${user.name}|${user.branchId}`
    if (!seen.has(key)) {
      seen.add(key)
      continue
    }
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date(), deletedById: adminId } })
    removed.nguoiTrung = (removed.nguoiTrung ?? 0) + 1
  }

  // 3. Món demo cũ trùng nghĩa với món mới trong thực đơn Việt Nam
  const duplicateNames = ['Gỏi cuốn tôm thịt', 'Phở bò', 'Bún chả Hà Nội', 'Cơm tấm sườn bì chả']
  for (const name of duplicateNames) {
    const product = await prisma.product.findFirst({ where: { name, deletedAt: null }, select: { id: true } })
    if (!product) continue
    await prisma.product.update({ where: { id: product.id }, data: { deletedAt: new Date(), deletedById: adminId } })
    removed.monTrung = (removed.monTrung ?? 0) + 1
  }

  // 4. Danh mục "Tinh hoa Việt" chỉ là nhóm tạm của bộ dữ liệu cũ -> chuyển món sang "Món chính"
  const tempCategory = await prisma.category.findFirst({ where: { name: 'Tinh hoa Việt', deletedAt: null } })
  const mainCourse = await prisma.category.findFirst({ where: { name: 'Món chính', deletedAt: null } })
  if (tempCategory && mainCourse) {
    // updateMany không set được quan hệ nhiều-nhiều -> duyệt từng sản phẩm
    const tempProducts = await prisma.product.findMany({
      where: { categories: { some: { id: tempCategory.id } }, deletedAt: null },
      select: { id: true },
    })
    for (const product of tempProducts) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          categories: { disconnect: [{ id: tempCategory.id }], connect: [{ id: mainCourse.id }] },
        },
      })
    }
    await prisma.category.update({
      where: { id: tempCategory.id },
      data: { deletedAt: new Date(), deletedById: adminId },
    })
    removed.danhMucTam = 1
  }

  // 5. Bàn dư: mỗi chi nhánh chỉ giữ 12 bàn của bộ dữ liệu này
  const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true } })
  for (const branch of branches) {
    const tables = await prisma.tableNode.findMany({
      where: { branchId: branch.id, deletedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    })
    const ours = tables.filter((table) => /^(Bàn \d{2}|VIP \d{2}|Sân vườn \d{2}|Quầy bar \d{2})$/.test(table.name))
    const extras = tables.filter((table) => !ours.includes(table))
    for (const table of extras) {
      await prisma.tableNode.update({
        where: { id: table.id },
        data: { deletedAt: new Date(), deletedById: adminId, status: 'AVAILABLE', openedAt: null, openedById: null },
      })
      removed.banDu = (removed.banDu ?? 0) + 1
    }
  }

  return removed
}


/** Sửa những chỗ dữ liệu cũ trông không giống thật (món demo, giá 0đ, tồn kho do test bơm) */
async function repairData(adminId: number) {
  const fixed: Record<string, number> = {}

  // 1. Món không thuộc thực đơn nhà hàng Việt (hàng demo của project mẫu) -> xoá mềm
  const notRestaurantFood = ['Serum NAB', 'GỎI GÀ']
  for (const name of notRestaurantFood) {
    const product = await prisma.product.findFirst({ where: { name, deletedAt: null }, select: { id: true } })
    if (!product) continue
    await prisma.product.update({ where: { id: product.id }, data: { deletedAt: new Date(), deletedById: adminId } })
    fixed.monKhongHopLe = (fixed.monKhongHopLe ?? 0) + 1
  }

  // 2. Món trùng tên (bộ dữ liệu cũ + mới sinh ra cùng tên) -> giữ bản id nhỏ nhất
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })
  const seenNames = new Set<string>()
  for (const product of products) {
    const key = product.name.trim().toLowerCase()
    if (!seenNames.has(key)) {
      seenNames.add(key)
      continue
    }
    await prisma.product.update({ where: { id: product.id }, data: { deletedAt: new Date(), deletedById: adminId } })
    fixed.monTrungTen = (fixed.monTrungTen ?? 0) + 1
  }

  // 3. Nguyên liệu: giá nhập 0đ hoặc tồn kho bị bơm bởi test -> đưa về số hợp lý
  const priceHints = new Map<string, number>([
    ...INGREDIENTS.map((item) => [item.name, item.cost] as [string, number]),
    // nguyên liệu do bộ dữ liệu demo cũ tạo (tên chung chung) — giá theo mặt hàng thật
    ['Gà', 135000],
    ['Thịt bò', 320000],
    ['Bánh phở', 32000],
    ['Hành lá', 22000],
    ['Cà phê bột', 260000],
    ['Đào ngâm', 60000],
  ])
  const ingredients = await prisma.ingredient.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, stock: true, unitCost: true, unitId: true },
  })
  for (const ingredient of ingredients) {
    const patch: { unitCost?: number; stock?: number } = {}
    const hint = priceHints.get(ingredient.name)
    // 45.000 là giá trị mặc định mình đã điền cho nguyên liệu cũ chưa có giá -> thay bằng giá thật
    if (Number(ingredient.unitCost) <= 0 || (hint !== undefined && Number(ingredient.unitCost) === 45000)) {
      patch.unitCost = hint ?? (ingredient.unitId === 'piece' ? 20000 : 45000)
    }
    if (Number(ingredient.stock) > 10000) {
      // tồn kho bị bơm 1.000.000 bởi helper test -> đưa về mức nhà hàng thật
      patch.stock = 30
    }
    if (Object.keys(patch).length === 0) continue
    await prisma.ingredient.update({ where: { id: ingredient.id }, data: patch })
    fixed.nguyenLieuSua = (fixed.nguyenLieuSua ?? 0) + 1
  }

  // 4. Phiếu nhập: tiền đồng không có phần lẻ -> làm tròn
  const receipts = await prisma.stockReceipt.findMany({ select: { id: true, unitCost: true } })
  for (const receipt of receipts) {
    const rounded = Math.round(Number(receipt.unitCost))
    if (rounded === Number(receipt.unitCost)) continue
    await prisma.stockReceipt.update({ where: { id: receipt.id }, data: { unitCost: rounded } })
    fixed.phieuNhapLamTron = (fixed.phieuNhapLamTron ?? 0) + 1
  }

  // 5. Giá bán cũng phải là số nguyên đồng
  const productsToRound = await prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, basePrice: true, virtualPrice: true } })
  for (const product of productsToRound) {
    const base = Math.round(Number(product.basePrice))
    const virtual = Math.round(Number(product.virtualPrice))
    if (base === Number(product.basePrice) && virtual === Number(product.virtualPrice)) continue
    await prisma.product.update({ where: { id: product.id }, data: { basePrice: base, virtualPrice: virtual } })
  }

  // 6. Phân loại lại danh mục theo TÊN món (bộ dữ liệu cũ để sai: bánh flan nằm ở "Món chính")
  const categoryIds = new Map(
    (await prisma.category.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })).map(
      (category) => [category.name, category.id],
    ),
  )
  /**
   * Xếp món vào danh mục theo TÊN, xét theo thứ tự ưu tiên.
   *
   * Thứ tự quan trọng: "Bánh flan cà phê" phải vào Tráng miệng (không phải Đồ uống vì có chữ
   * "cà phê"), "Nem nướng" phải vào Khai vị (không phải Lẩu & Nướng vì có chữ "nướng"),
   * "Gà hấp lá chanh" không được khớp "chanh" của "chanh dây".
   */
  const RULES: [RegExp, string][] = [
    [/(bia|rượu)/, 'Bia & Rượu'],
    [/(chè|flan|rau câu)/, 'Tráng miệng'],
    [/(cơm)/, 'Món chính'],
    [/(gỏi|chả giò|nem|bánh khọt|súp|cuốn|bò lá lốt)/, 'Khai vị'],
    [/(cà phê|trà|chanh dây|sinh tố|nước chanh|nước dừa)/, 'Đồ uống'],
    [/(lẩu|nướng)/, 'Lẩu & Nướng'],
  ]
  const classify = (name: string) => {
    const lower = name.toLowerCase()
    for (const [pattern, category] of RULES) if (pattern.test(lower)) return category
    return 'Món chính'
  }
  const allDishes = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, categories: { select: { id: true, name: true } } },
  })
  for (const dish of allDishes) {
    const wanted = classify(dish.name)
    const wantedId = categoryIds.get(wanted)
    if (!wantedId) continue
    if (dish.categories.length === 1 && dish.categories[0].id === wantedId) continue
    await prisma.product.update({
      where: { id: dish.id },
      data: {
        categories: {
          set: [{ id: wantedId }],
        },
      },
    })
    fixed.phanLoaiLai = (fixed.phanLoaiLai ?? 0) + 1
  }

  // 7. Đơn rác: PENDING, thanh toán PENDING, KHÔNG có bút toán nào và đã quá 1 ngày.
  //    Đây là đơn do lần chạy e2e bị huỷ để lại — hiện trong danh sách đơn của staging như đơn
  //    thật nhưng chưa từng có tiền. Bút toán là bằng chứng "đơn có tiền", nên không có = xoá được.
  const oldPendingOrders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: 'PENDING',
      createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      payment: { is: { status: 'PENDING' } },
    },
    select: { id: true, paymentId: true },
  })
  for (const order of oldPendingOrders) {
    // Bút toán là bằng chứng "đơn đã có tiền" -> có bút toán thì KHÔNG xoá
    const entries = await prisma.ledgerEntry.count({
      where: { refId: order.id, refType: { in: ['ORDER_PAID_CASH', 'ORDER_PAID_VNPAY'] } },
    })
    if (entries > 0) continue
    await prisma.productSKUSnapshot.deleteMany({ where: { orderId: order.id } })
    await prisma.order.delete({ where: { id: order.id } })
    fixed.donRac = (fixed.donRac ?? 0) + 1
  }

  // 8. Payment mồ côi: không còn đơn nào trỏ tới, vẫn PENDING (chưa từng có tiền) -> xoá
  const orphans = await prisma.payment.findMany({
    where: { status: 'PENDING', order: { none: {} } },
    select: { id: true },
  })
  if (orphans.length) {
    await prisma.payment.deleteMany({ where: { id: { in: orphans.map((payment) => payment.id) } } })
    fixed.paymentMoCoi = orphans.length
  }

  return fixed
}

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { deletedAt: null }, orderBy: { id: 'asc' } })
  const passwordHash = await hashing.hashPassword(PASSWORD)

  // ── 1. Ba chi nhánh ────────────────────────────────────────────────────────
  const existingBranches = await prisma.branch.findMany({ orderBy: { id: 'asc' } })
  const branchIds: number[] = []
  for (const [index, target] of BRANCHES.entries()) {
    const existing = existingBranches[index]
    const branch = existing
      ? await prisma.branch.update({
          where: { id: existing.id },
          data: {
            code: target.code,
            name: target.name,
            address: target.address,
            isActive: true,
            taxRate: 8,
            serviceChargeRate: 5,
            pricesIncludeTax: true,
          },
        })
      : await prisma.branch.create({
          data: {
            code: target.code,
            name: target.name,
            address: target.address,
            isActive: true,
            taxRate: 8,
            serviceChargeRate: 5,
            pricesIncludeTax: true,
          },
        })
    branchIds.push(branch.id)
    console.log(`chi nhánh #${branch.id} ${branch.code} — ${branch.name}`)
  }

  // ── 2. Khu vực + bàn cho từng chi nhánh ────────────────────────────────────
  for (const [index, branchId] of branchIds.entries()) {
    let area = await prisma.area.findFirst({ where: { branchId, deletedAt: null }, orderBy: { id: 'asc' } })
    if (!area) {
      area = await prisma.area.create({
        data: { name: 'Khu vực chính', branchId, createdById: admin.id, isActive: true },
      })
    }

    const tableNames = [
      'Bàn 01', 'Bàn 02', 'Bàn 03', 'Bàn 04', 'Bàn 05', 'Bàn 06',
      'Bàn 07', 'Bàn 08', 'VIP 01', 'VIP 02', 'Sân vườn 01', 'Quầy bar 01',
    ]
    const tables = await prisma.tableNode.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { id: 'asc' },
    })
    for (const [tableIndex, name] of tableNames.entries()) {
      const table = tables[tableIndex]
      if (table) {
        await prisma.tableNode.update({
          where: { id: table.id },
          data: { name, areaId: area.id, branchId, status: 'AVAILABLE', openedAt: null, openedById: null },
        })
      } else {
        await prisma.tableNode.create({
          data: {
            name,
            seats: name.startsWith('VIP') ? 10 : name.startsWith('Sân') ? 8 : 4,
            type: 'TABLE',
            status: 'AVAILABLE',
            positionX: tableIndex * 80,
            positionY: 0,
            width: 60,
            height: 60,
            imageUrl: '',
            areaId: area.id,
            branchId,
            createdById: admin.id,
            token: `tbl${branchId}${tableIndex}${Date.now()}${rand(100, 999)}`,
          },
        })
      }
    }
    console.log(`chi nhánh #${branchId}: ${tableNames.length} bàn`)
    void index
  }

  // ── 3. Tài khoản: 15 nhân viên + 1 kế toán mỗi chi nhánh ───────────────────
  const staffRole = await prisma.role.findFirstOrThrow({ where: { name: 'STAFF' } })
  const accountantRole = await prisma.role.findFirstOrThrow({ where: { name: 'KE_TOAN' } })

  const ensureUser = async (input: {
    name: string
    emailBase: string
    phone: string
    branchId: number
    roleId: number
  }) => {
    // Idempotent theo (tên + chi nhánh): chạy lại script không tạo thêm người trùng tên.
    const samePersion = await prisma.user.findFirst({
      where: { name: input.name, branchId: input.branchId, deletedAt: null },
      select: { email: true },
    })
    if (samePersion) return samePersion.email

    let email = `${input.emailBase}@order.com`
    let suffix = 2
    while (await prisma.user.findFirst({ where: { email }, select: { id: true } })) {
      email = `${input.emailBase}${suffix}@order.com`
      suffix += 1
    }
    await prisma.user.create({
      data: {
        name: input.name,
        email,
        phoneNumber: input.phone,
        password: passwordHash,
        branchId: input.branchId,
        roleId: input.roleId,
        status: UserStatus.ACTIVE,
        createdById: admin.id,
      },
    })
    return email
  }

  // Số điện thoại phải UNIQUE trong DB: nạp sẵn các số đã dùng rồi cấp số kế tiếp chưa ai dùng.
  const usedPhones = new Set(
    (
      await prisma.user.findMany({
        where: { phoneNumber: { not: null } },
        select: { phoneNumber: true },
      })
    ).map((user) => user.phoneNumber as string),
  )
  let phoneCounter = 0
  const nextPhone = () => {
    // 09xxxxxxxx — đầu số di động Việt Nam, đủ 10 số
    for (;;) {
      phoneCounter += 1
      const candidate = `09${String(10000000 + phoneCounter).slice(-8)}`
      if (!usedPhones.has(candidate)) {
        usedPhones.add(candidate)
        return candidate
      }
    }
  }

  let createdUsers = 0
  for (const [branchIndex, branchId] of branchIds.entries()) {
    for (let i = 0; i < 15; i += 1) {
      const name = EMPLOYEE_NAMES[branchIndex * 15 + i]
      // 2 người đầu mỗi chi nhánh là thu ngân -> ghi rõ trong tên để dễ nhận
      const displayName = i < 2 ? `Thu ngân ${name}` : name
      const email = await ensureUser({
        name: displayName,
        emailBase: `${slug(name)}.q${branchIndex + 1}`,
        phone: nextPhone(),
        branchId,
        roleId: staffRole.id,
      })
      createdUsers += 1
      void email
    }
    await ensureUser({
      name: ACCOUNTANT_NAMES[branchIndex],
      emailBase: `${slug(ACCOUNTANT_NAMES[branchIndex])}.kt`,
      phone: nextPhone(),
      branchId,
      roleId: accountantRole.id,
    })
    createdUsers += 1
    console.log(`chi nhánh #${branchId}: 15 nhân viên + 1 kế toán`)
  }
  console.log(`tổng tài khoản tạo mới: ${createdUsers}`)

  // ── 4. Danh mục + món ăn + SKU ─────────────────────────────────────────────
  const categories = new Map<string, number>()
  for (const name of CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { name, deletedAt: null }, select: { id: true } })
    const category =
      existing ??
      (await prisma.category.create({ data: { name, logo: '', createdById: admin.id } }))
    categories.set(name, category.id)
  }
  // dọn danh mục rác do lần thử trước để lại
  for (const junk of ['Gà', 'GÀ']) {
    const found = await prisma.category.findFirst({ where: { name: junk, deletedAt: null }, select: { id: true } })
    if (found) {
      await prisma.category.update({ where: { id: found.id }, data: { deletedAt: new Date(), deletedById: admin.id } })
    }
  }

  const ensureDish = async (dish: { name: string; price: number; category: string }) => {
    const categoryId = categories.get(dish.category) ?? categories.get('Món chính')!
    const existing = await prisma.product.findFirst({ where: { name: dish.name, deletedAt: null }, select: { id: true } })
    const product = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: { basePrice: dish.price, virtualPrice: dish.price, status: ProductStatus.ACTIVE },
        })
      : await prisma.product.create({
          data: {
            name: dish.name,
            basePrice: dish.price,
            virtualPrice: dish.price,
            images: [],
            variants: [{ value: 'PHẦN', valueOption: [{ value: 'Tiêu chuẩn', price: dish.price, image: '' }] }],
            status: ProductStatus.ACTIVE,
            publishedAt: new Date(),
            createdById: admin.id,
            categories: { connect: [{ id: categoryId }] },
          },
        })

    const sku = await prisma.sKU.findFirst({ where: { productId: product.id, deletedAt: null }, select: { id: true } })
    if (!sku) {
      await prisma.sKU.create({
        data: {
          productId: product.id,
          value: 'Tiêu chuẩn',
          price: dish.price,
          image: '',
          status: SKUStatus.AVAILABLE,
          createdById: admin.id,
        },
      })
    } else {
      await prisma.sKU.update({ where: { id: sku.id }, data: { price: dish.price, status: SKUStatus.AVAILABLE } })
    }
    return product.id
  }

  for (const dish of DISHES) await ensureDish(dish)
  console.log(`món ăn: đã bảo đảm ${DISHES.length} món mới + ${await prisma.product.count({ where: { deletedAt: null } })} món đang có`)

  // ── 5. Nguyên liệu ─────────────────────────────────────────────────────────
  const ingredientIds: { id: number; unitId: string; cost: number }[] = []
  for (const item of INGREDIENTS) {
    const existing = await prisma.ingredient.findFirst({
      where: { name: item.name, deletedAt: null },
      select: { id: true },
    })
    const ingredient = existing
      ? await prisma.ingredient.update({
          where: { id: existing.id },
          data: { unitId: item.unit, unitCost: round(item.cost), isActive: true },
        })
      : await prisma.ingredient.create({
          data: {
            name: item.name,
            unitId: item.unit,
            unitCost: round(item.cost),
            stock: 0,
            minStock: 5,
            isActive: true,
            createdById: admin.id,
          },
        })
    ingredientIds.push({ id: ingredient.id, unitId: item.unit, cost: item.cost })
  }
  console.log(`nguyên liệu: ${ingredientIds.length}`)

  // ── 6. Định lượng cho MỌI SKU đang bán (2–4 nguyên liệu/sku) ───────────────
  const skus = await prisma.sKU.findMany({
    where: { deletedAt: null, product: { deletedAt: null, status: ProductStatus.ACTIVE } },
    select: { id: true, price: true },
  })
  let recipeRows = 0
  for (const sku of skus) {
    const existing = await prisma.sKURecipeIngredient.count({ where: { skuId: sku.id, deletedAt: null } })
    if (existing > 0) continue
    const parts = rand(2, 4)
    const chosen = new Set<number>()
    for (let i = 0; i < parts; i += 1) {
      const ingredient = pick(ingredientIds)
      if (chosen.has(ingredient.id)) continue
      chosen.add(ingredient.id)
      // số lượng theo đơn vị: kg/l dùng 0.02–0.25 ; g dùng 5–60 ; piece dùng 1–2
      const quantity =
        ingredient.unitId === 'g' ? rand(5, 60) : ingredient.unitId === 'piece' ? rand(1, 2) : round(rand(2, 25) / 100)
      await prisma.sKURecipeIngredient.create({
        data: { skuId: sku.id, ingredientId: ingredient.id, quantity, unitId: ingredient.unitId },
      })
      recipeRows += 1
    }
  }
  console.log(`định lượng: thêm ${recipeRows} dòng`)

  // ── 7. Phiếu nhập hàng (cộng dồn tồn + bình quân giá quyền, đúng như app) ──
  let receipts = 0
  for (const ingredient of ingredientIds) {
    const existing = await prisma.stockReceipt.count({ where: { ingredientId: ingredient.id } })
    if (existing > 0) continue
    const times = rand(2, 4)
    for (let i = 0; i < times; i += 1) {
      const quantity = ingredient.unitId === 'piece' ? rand(50, 200) : rand(10, 60)
      const unitCost = Math.round(ingredient.cost * (0.92 + Math.random() * 0.2))
      await prisma.$transaction(async (tx) => {
        const current = await tx.ingredient.findUniqueOrThrow({
          where: { id: ingredient.id },
          select: { stock: true, unitCost: true },
        })
        const oldStock = Number(current.stock)
        const oldCost = Number(current.unitCost)
        const newStock = oldStock + quantity
        const newCost = oldStock > 0 && oldCost > 0 ? (oldStock * oldCost + quantity * unitCost) / newStock : unitCost
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { stock: newStock, unitCost: round(newCost) },
        })
        await tx.stockReceipt.create({
          data: {
            ingredientId: ingredient.id,
            quantity,
            unitCost,
            supplier: pick(SUPPLIERS),
            note: `Nhập hàng đợt ${i + 1}`,
            images: [],
            stockAfter: newStock,
            receivedAt: new Date(Date.now() - (times - i) * 24 * 60 * 60 * 1000),
            createdById: admin.id,
          },
        })
      })
      receipts += 1
    }
  }
  console.log(`phiếu nhập hàng: thêm ${receipts}`)

  const cleaned = await cleanupLegacy(admin.id)
  console.log('dọn dấu vết cũ:', JSON.stringify(cleaned))
  const repaired = await repairData(admin.id)
  console.log('sửa dữ liệu chưa giống thật:', JSON.stringify(repaired))

  const summary = {
    chiNhanh: await prisma.branch.count({ where: { isActive: true } }),
    nhanVien: await prisma.user.count({ where: { deletedAt: null, roleId: { in: [staffRole.id, accountantRole.id] } } }),
    danhMuc: await prisma.category.count({ where: { deletedAt: null } }),
    monAn: await prisma.product.count({ where: { deletedAt: null } }),
    sku: await prisma.sKU.count({ where: { deletedAt: null } }),
    ban: await prisma.tableNode.count({ where: { deletedAt: null } }),
    nguyenLieu: await prisma.ingredient.count({ where: { deletedAt: null } }),
    dinhLuong: await prisma.sKURecipeIngredient.count({ where: { deletedAt: null } }),
    phieuNhap: await prisma.stockReceipt.count(),
  }
  console.log('\n=== TỔNG KẾT ===')
  for (const [key, value] of Object.entries(summary)) console.log(`  ${key}: ${value}`)
}

main()
  .catch((error) => {
    console.error('Tạo dữ liệu thất bại:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
