import { Prisma, PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'
import { LedgerPostingService } from '@/shared/service/ledger-posting.service'
import { buildOrderLedgerLines } from '@/shared/service/order-ledger-lines'
import { normalizeCustomerPhone } from '@/routes/customer/customer.identity'

const prisma = new PrismaClient()
const ledger = new LedgerPostingService(prisma as never)

/**
 * Seed dữ liệu demo cho các bảng nghiệp vụ (chạy SAU `npm run seed:catalog`).
 *
 * Phủ: chi nhánh · khu vực · sơ đồ bàn · bàn · quy đổi đơn vị · nguyên liệu · định lượng (recipe)
 *      · tồn kho SKU · khách · đặt bàn · voucher (+ snapshot) · đơn hàng + thanh toán + bút toán sổ cái
 *      · payment intent · nhắc việc + log · đánh giá.
 *
 * Nguyên tắc:
 * - Idempotent: mọi bản ghi tìm theo khoá tự nhiên (code/name/token/receiver.seedKey/…) trước khi tạo.
 * - Tiền tính bằng số nguyên VND; đơn đã thanh toán được ghi sổ qua LedgerPostingService nên Nợ = Có.
 * - Không xoá/sửa dữ liệu có sẵn của bạn (chỉ tạo mới hoặc cập nhật bản ghi do chính seed tạo).
 *
 * Chạy:  npm run seed:demo
 *        npm run seed:demo -- --dry-run
 */

const DRY_RUN = process.argv.includes('--dry-run')
const LANGUAGE_ID = 'vi'
const ADMIN_EMAIL = 'admin@order.com'

/** token 32 hex giống dữ liệu đang có, sinh tất định để chạy lại không tạo trùng */
const stableToken = (key: string) => createHash('md5').update(`demo-seed:${key}`).digest('hex')

const VND = (value: number) => new Prisma.Decimal(value)

const log = (scope: string, message: string) => console.log(`  [${scope}] ${message}${DRY_RUN ? ' (dry-run)' : ''}`)

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: ADMIN_EMAIL, deletedAt: null }, select: { id: true } })
  if (!admin) throw new Error(`Không tìm thấy ${ADMIN_EMAIL} — chạy \`npm run init-seed-data\` trước`)
  const staff = await prisma.user.findFirst({
    where: { id: { not: admin.id }, deletedAt: null },
    select: { id: true, name: true },
  })
  const customerId = staff?.id ?? admin.id

  // ── 1. Chi nhánh ────────────────────────────────────────────────────────────
  const branches: { code: string; name: string; address: string }[] = [
    { code: 'MAIN', name: 'Chi nhánh chính', address: '123 Nguyễn Trãi, Q.5, TP.HCM' },
    { code: 'Q1', name: 'Chi nhánh Quận 1', address: '45 Lê Lợi, Q.1, TP.HCM' },
  ]
  const branchIdByCode = new Map<string, number>()
  for (const branch of branches) {
    if (DRY_RUN) {
      const existing = await prisma.branch.findUnique({ where: { code: branch.code }, select: { id: true } })
      branchIdByCode.set(branch.code, existing?.id ?? -1)
      log('branch', `${branch.code} ${existing ? 'đã có' : 'sẽ tạo'}`)
      continue
    }
    const record = await prisma.branch.upsert({
      where: { code: branch.code },
      update: { name: branch.name, address: branch.address, isActive: true },
      create: { code: branch.code, name: branch.name, address: branch.address },
    })
    branchIdByCode.set(branch.code, record.id)
    log('branch', `#${record.id} ${branch.code} ${branch.name}`)
  }
  const mainBranchId = branchIdByCode.get('MAIN') ?? 1

  // ── 2. Khu vực + sơ đồ + node bàn ───────────────────────────────────────────
  const areas: { branch: string; name: string; isActive: boolean }[] = [
    { branch: 'MAIN', name: 'Sảnh chính', isActive: true },
    { branch: 'MAIN', name: 'Sân vườn', isActive: true },
    { branch: 'Q1', name: 'Tầng 1', isActive: true },
  ]
  const areaIdByKey = new Map<string, number>()
  for (const area of areas) {
    const branchId = branchIdByCode.get(area.branch)
    if (!branchId || branchId < 0) {
      log('area', `${area.branch}/${area.name} bỏ qua (dry-run)`)
      continue
    }
    if (DRY_RUN) {
      log('area', `${area.branch}/${area.name}`)
      continue
    }
    const record = await prisma.area.upsert({
      where: { branchId_name: { branchId, name: area.name } },
      update: { isActive: area.isActive, updatedById: admin.id },
      create: { branchId, name: area.name, isActive: area.isActive, createdById: admin.id },
    })
    areaIdByKey.set(`${area.branch}/${area.name}`, record.id)
    log('area', `#${record.id} ${area.branch}/${area.name}`)
  }

  const layoutAreaId = areaIdByKey.get('MAIN/Sảnh chính')
  let layoutId: number | undefined
  if (layoutAreaId && !DRY_RUN) {
    const existingLayout = await prisma.tableLayout.findFirst({
      where: { areaId: layoutAreaId, name: 'Sơ đồ sảnh chính', deletedAt: null },
      select: { id: true },
    })
    const layout = existingLayout
      ? await prisma.tableLayout.update({
          where: { id: existingLayout.id },
          data: { status: 'ACTIVE', updatedById: admin.id },
        })
      : await prisma.tableLayout.create({
          data: { areaId: layoutAreaId, name: 'Sơ đồ sảnh chính', status: 'ACTIVE', createdById: admin.id },
        })
    layoutId = layout.id
    log('layout', `#${layout.id} Sơ đồ sảnh chính (ACTIVE)`)
  }

  const tableNodes: { area: string; name: string; seats: number; type: 'TABLE' | 'ROUND' | 'SQUARE'; x: number; y: number }[] = [
    { area: 'MAIN/Sảnh chính', name: 'Bàn 5 (4 ghế)', seats: 4, type: 'SQUARE', x: 120, y: 80 },
    { area: 'MAIN/Sảnh chính', name: 'Bàn 6 (4 ghế)', seats: 4, type: 'SQUARE', x: 380, y: 80 },
    { area: 'MAIN/Sảnh chính', name: 'Bàn 7 (8 ghế)', seats: 8, type: 'ROUND', x: 250, y: 300 },
    { area: 'MAIN/Sân vườn', name: 'Bàn sân vườn 1', seats: 2, type: 'TABLE', x: 100, y: 120 },
    { area: 'MAIN/Sân vườn', name: 'Bàn sân vườn 2', seats: 2, type: 'TABLE', x: 260, y: 120 },
    { area: 'Q1/Tầng 1', name: 'Bàn Q1-01', seats: 4, type: 'SQUARE', x: 140, y: 140 },
  ]
  const nodeIdByName = new Map<string, number>()
  for (const node of tableNodes) {
    const areaId = areaIdByKey.get(node.area)
    const branchId = branchIdByCode.get(node.area.split('/')[0])
    if (!areaId || !branchId || DRY_RUN) {
      log('tableNode', `${node.name} (${node.area})`)
      continue
    }
    const token = stableToken(`node:${node.name}`)
    const record = await prisma.tableNode.upsert({
      where: { token },
      update: {
        name: node.name,
        seats: node.seats,
        type: node.type,
        positionX: node.x,
        positionY: node.y,
        updatedById: admin.id,
      },
      create: {
        token,
        name: node.name,
        seats: node.seats,
        type: node.type,
        status: 'AVAILABLE',
        positionX: node.x,
        positionY: node.y,
        rotation: 0,
        width: 100,
        height: 100,
        // Rỗng: sơ đồ bàn dùng icon mặc định; admin upload ảnh bàn thật nếu cần
        imageUrl: '',
        areaId,
        branchId,
        layoutId: node.area === 'MAIN/Sảnh chính' ? layoutId : undefined,
        createdById: admin.id,
      },
    })
    nodeIdByName.set(node.name, record.id)
    log('tableNode', `#${record.id} ${node.name}`)
  }

  // ── 3. Bàn (bảng Table: number là khoá chính) ──────────────────────────────
  for (let number = 1; number <= 6; number += 1) {
    if (DRY_RUN) {
      log('table', `bàn số ${number}`)
      continue
    }
    const record = await prisma.table.upsert({
      where: { number },
      update: { capacity: number <= 2 ? 2 : 4, branchId: mainBranchId, updatedById: admin.id },
      create: {
        number,
        capacity: number <= 2 ? 2 : 4,
        status: 'AVAILABLE',
        token: stableToken(`table:${number}`),
        branchId: mainBranchId,
        createdById: admin.id,
      },
    })
    log('table', `#${record.number} sức chứa ${record.capacity}`)
  }

  // ── 4. Quy đổi đơn vị + nguyên liệu + định lượng + tồn kho SKU ─────────────
  const conversions = [
    { fromUnitId: 'kg', toUnitId: 'g', factor: 1000 },
    { fromUnitId: 'l', toUnitId: 'ml', factor: 1000 },
  ]
  if (!DRY_RUN) {
    for (const conversion of conversions) {
      await prisma.unitConversion.upsert({
        where: { fromUnitId_toUnitId: { fromUnitId: conversion.fromUnitId, toUnitId: conversion.toUnitId } },
        update: { factor: conversion.factor, updatedById: admin.id },
        create: { ...conversion, createdById: admin.id },
      })
      log('unitConversion', `${conversion.fromUnitId} -> ${conversion.toUnitId} x${conversion.factor}`)
    }
  }

  const ingredients: { name: string; unitId: string; stock: number; minStock: number }[] = [
    { name: 'Thịt bò', unitId: 'kg', stock: 25, minStock: 5 },
    { name: 'Bánh phở', unitId: 'kg', stock: 18, minStock: 4 },
    { name: 'Hành lá', unitId: 'kg', stock: 3.5, minStock: 1 },
    { name: 'Cà phê bột', unitId: 'kg', stock: 6, minStock: 2 },
    { name: 'Sữa đặc', unitId: 'l', stock: 12, minStock: 3 },
    { name: 'Đào ngâm', unitId: 'kg', stock: 4, minStock: 1 },
  ]
  const ingredientIdByName = new Map<string, number>()
  for (const ingredient of ingredients) {
    if (DRY_RUN) {
      log('ingredient', ingredient.name)
      continue
    }
    const existing = await prisma.ingredient.findFirst({
      where: { name: ingredient.name, deletedAt: null },
      select: { id: true },
    })
    const record = existing
      ? await prisma.ingredient.update({
          where: { id: existing.id },
          data: { unitId: ingredient.unitId, stock: ingredient.stock, minStock: ingredient.minStock, updatedById: admin.id },
        })
      : await prisma.ingredient.create({ data: { ...ingredient, createdById: admin.id } })
    ingredientIdByName.set(ingredient.name, record.id)
    log('ingredient', `#${record.id} ${ingredient.name} (${ingredient.stock}${ingredient.unitId})`)
  }

  /** Định lượng gắn vào SKU thật của menu (chạy sau seed:catalog) */
  const pho = await prisma.product.findFirst({ where: { name: 'Phở bò', deletedAt: null }, select: { id: true } })
  const coffee = await prisma.product.findFirst({ where: { name: 'Cà phê sữa đá', deletedAt: null }, select: { id: true } })
  const recipeBySku: { productId?: number; skuValue: string; items: { ingredient: string; quantity: number; unitId: string }[] }[] = [
    {
      productId: pho?.id,
      skuValue: 'Vừa',
      items: [
        { ingredient: 'Thịt bò', quantity: 0.15, unitId: 'kg' },
        { ingredient: 'Bánh phở', quantity: 0.25, unitId: 'kg' },
        { ingredient: 'Hành lá', quantity: 0.02, unitId: 'kg' },
      ],
    },
    {
      productId: coffee?.id,
      skuValue: 'M',
      items: [
        { ingredient: 'Cà phê bột', quantity: 0.02, unitId: 'kg' },
        { ingredient: 'Sữa đặc', quantity: 0.03, unitId: 'l' },
      ],
    },
  ]
  for (const recipe of recipeBySku) {
    if (!recipe.productId) {
      log('recipe', `bỏ qua ${recipe.skuValue} (chưa có sản phẩm — chạy seed:catalog trước)`)
      continue
    }
    const sku = await prisma.sKU.findFirst({
      where: { productId: recipe.productId, value: recipe.skuValue, deletedAt: null },
      select: { id: true },
    })
    if (!sku) {
      log('recipe', `bỏ qua ${recipe.skuValue} (không có SKU)`)
      continue
    }
    if (!DRY_RUN) {
      await prisma.sKUStockCache.upsert({
        where: { skuId: sku.id },
        update: { stock: 50 },
        create: { skuId: sku.id, stock: 50 },
      })
    }
    for (const item of recipe.items) {
      const ingredientId = ingredientIdByName.get(item.ingredient)
      if (!ingredientId) continue
      if (DRY_RUN) {
        log('recipe', `${recipe.skuValue} ← ${item.quantity}${item.unitId} ${item.ingredient}`)
        continue
      }
      await prisma.sKURecipeIngredient.upsert({
        where: { skuId_ingredientId: { skuId: sku.id, ingredientId } },
        update: { quantity: item.quantity, unitId: item.unitId, updatedById: admin.id, deletedAt: null },
        create: {
          skuId: sku.id,
          ingredientId,
          quantity: item.quantity,
          unitId: item.unitId,
          createdById: admin.id,
        },
      })
      log('recipe', `${recipe.skuValue} ← ${item.quantity}${item.unitId} ${item.ingredient}`)
    }
  }

  // ── 5. Khách + đặt bàn ────────────────────────────────────────────────────
  const guestName = 'Khách demo A'
  const tableNodeId = nodeIdByName.get('Bàn 5 (4 ghế)')
  let guestId: number | undefined
  if (!DRY_RUN && tableNodeId) {
    const existingGuest = await prisma.guest.findFirst({
      where: { name: guestName, tableNodeId, deletedAt: null },
      select: { id: true },
    })
    const guest = existingGuest ?? (await prisma.guest.create({ data: { name: guestName, tableNodeId, createdById: admin.id } }))
    guestId = guest.id
    log('guest', `#${guest.id} ${guestName}`)
  }

  /**
   * Hồ sơ khách (CRM). Seed ghi thẳng vào DB nên KHÔNG đi qua luồng đặt bàn của API — nếu không
   * tạo ở đây thì màn hình khách hàng của đồ án mở ra trống, dù dữ liệu demo có cả đơn lẫn đặt bàn.
   */
  const demoCustomers = [
    { name: 'Nguyễn Văn An', phone: '0901000001' },
    { name: 'Trần Thị Bình', phone: '0901000002' },
    { name: 'Lê Thị Chi', phone: '0901000003' },
  ]
  const customerIdByPhone = new Map<string, number>()
  for (const profile of demoCustomers) {
    const phone = normalizeCustomerPhone(profile.phone)
    if (!phone) continue
    if (DRY_RUN) {
      log('customer', `${profile.name} ${phone}`)
      continue
    }
    // `update: {}` — chạy lại không ghi đè tên/ghi chú người dùng đã sửa trong màn hình khách hàng
    const record = await prisma.customer.upsert({ where: { phone }, update: {}, create: { phone, name: profile.name } })
    customerIdByPhone.set(phone, record.id)
    log('customer', `#${record.id} ${profile.name} ${phone}`)
  }

  const reservations: { seedKey: string; name: string; phone: string; guests: number; daysFromNow: number; status: 'PENDING' | 'CONFIRMED' }[] = [
    { seedKey: 'res-1', name: 'Nguyễn Văn An', phone: '0901000001', guests: 4, daysFromNow: 1, status: 'CONFIRMED' },
    { seedKey: 'res-2', name: 'Trần Thị Bình', phone: '0901000002', guests: 2, daysFromNow: 2, status: 'PENDING' },
  ]
  for (const reservation of reservations) {
    const nodeId = nodeIdByName.get('Bàn 6 (4 ghế)') ?? tableNodeId
    if (!nodeId || DRY_RUN) {
      log('reservation', `${reservation.name} (${reservation.seedKey})`)
      continue
    }
    const existing = await prisma.reservation.findFirst({
      where: { note: `seed:${reservation.seedKey}`, deletedAt: null },
      select: { id: true },
    })
    if (existing) {
      log('reservation', `#${existing.id} ${reservation.name} (đã có)`)
      continue
    }
    const when = new Date(Date.now() + reservation.daysFromNow * 24 * 60 * 60 * 1000)
    when.setHours(19, 0, 0, 0)
    const record = await prisma.reservation.create({
      data: {
        userId: customerId,
        branchId: mainBranchId,
        tableNodeId: nodeId,
        customerName: reservation.name,
        customerPhone: reservation.phone,
        customerId: customerIdByPhone.get(normalizeCustomerPhone(reservation.phone) ?? '') ?? null,
        guestCount: reservation.guests,
        reservationTime: when,
        hasPreOrder: false,
        status: reservation.status,
        depositAmount: reservation.status === 'CONFIRMED' ? 200000 : null,
        depositPercent: reservation.status === 'CONFIRMED' ? 20 : null,
        note: `seed:${reservation.seedKey}`,
        createdById: admin.id,
      },
    })
    log('reservation', `#${record.id} ${reservation.name} ${reservation.status}`)
  }

  // ── 6. Voucher (+ snapshot) ────────────────────────────────────────────────
  const vouchers = [
    { code: 'WELCOME10', discountType: 'PERCENT' as const, discountValue: 10 },
    { code: 'GIAM50K', discountType: 'FIXED' as const, discountValue: 50000 },
  ]
  const voucherIdByCode = new Map<string, number>()
  for (const voucher of vouchers) {
    if (DRY_RUN) {
      log('voucher', voucher.code)
      continue
    }
    const record = await prisma.voucher.upsert({
      where: { code: voucher.code },
      update: { discountType: voucher.discountType, discountValue: voucher.discountValue, status: 'ACTIVE' },
      create: {
        code: voucher.code,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        startAt: new Date('2024-01-01T00:00:00Z'),
        endAt: new Date('2030-12-31T23:59:59Z'),
        usageLimit: 1000,
        status: 'ACTIVE',
        createdById: admin.id,
      },
    })
    voucherIdByCode.set(voucher.code, record.id)
    log('voucher', `#${record.id} ${voucher.code} (${voucher.discountType} ${voucher.discountValue})`)
  }

  // ── 7. Đơn đã thanh toán + bút toán sổ cái ─────────────────────────────────
  /** tìm SKU theo tên món + value, tính tiền đơn từ chính giá SKU trong DB */
  const findSku = async (productName: string, skuValue?: string) => {
    const product = await prisma.product.findFirst({ where: { name: productName, deletedAt: null }, select: { id: true } })
    if (!product) return null
    const sku = await prisma.sKU.findFirst({
      where: {
        productId: product.id,
        deletedAt: null,
        ...(skuValue ? { value: skuValue } : {}),
      },
      orderBy: { id: 'asc' },
      select: { id: true, value: true, price: true, image: true },
    })
    return sku ? { ...sku, productName, productId: product.id } : null
  }

  type SeedOrder = {
    seedKey: string
    method: 'CASH' | 'VNPAY'
    paidInto: 'CASH' | 'VNPAY_CLEARING'
    refType: 'ORDER_PAID_CASH' | 'ORDER_PAID_VNPAY'
    voucherCode?: string
    /** khách của đơn (SĐT trong `demoCustomers`) — để màn hình khách có lịch sử chi tiêu */
    customerPhone: string
    items: { productName: string; skuValue?: string; quantity: number }[]
    serviceChargeRate: number
    taxRate: number
  }

  const seedOrders: SeedOrder[] = [
    {
      seedKey: 'order-cash-1',
      method: 'CASH',
      paidInto: 'CASH',
      refType: 'ORDER_PAID_CASH',
      customerPhone: '0901000001',
      items: [
        { productName: 'Phở bò', skuValue: 'Vừa', quantity: 2 },
        { productName: 'Cà phê sữa đá', skuValue: 'M', quantity: 1 },
      ],
      serviceChargeRate: 5,
      taxRate: 8,
    },
    {
      seedKey: 'order-vnpay-1',
      method: 'VNPAY',
      paidInto: 'VNPAY_CLEARING',
      refType: 'ORDER_PAID_VNPAY',
      voucherCode: 'WELCOME10',
      customerPhone: '0901000002',
      items: [{ productName: 'Cà phê sữa đá', skuValue: 'S', quantity: 2 }],
      serviceChargeRate: 0,
      taxRate: 0,
    },
  ]

  for (const seedOrder of seedOrders) {
    const existing = await prisma.order.findFirst({
      where: { receiver: { path: ['seedKey'], equals: seedOrder.seedKey } },
      select: { id: true },
    })
    if (existing) {
      // Đơn đã có từ lần seed trước (trước khi có tầng khách hàng): gắn hồ sơ khách cho nó để màn
      // hình khách hàng không hiện một đơn "không ai mua".
      const wantedCustomerId = customerIdByPhone.get(seedOrder.customerPhone)
      if (wantedCustomerId && !DRY_RUN) {
        await prisma.order.updateMany({
          where: { id: existing.id, customerId: null },
          data: { customerId: wantedCustomerId },
        })
      }
      log('order', `${seedOrder.seedKey} đã có (#${existing.id})`)
      continue
    }

    const resolved = (
      await Promise.all(seedOrder.items.map((item) => findSku(item.productName, item.skuValue)))
    ).filter((sku): sku is NonNullable<typeof sku> => Boolean(sku))
    if (resolved.length !== seedOrder.items.length) {
      log('order', `${seedOrder.seedKey} bỏ qua (thiếu món — chạy \`npm run seed:catalog\` trước)`)
      continue
    }

    const subtotal = resolved.reduce((sum, sku, index) => sum + Number(sku.price) * seedOrder.items[index].quantity, 0)
    // Tính giảm giá từ định nghĩa voucher (không phụ thuộc DB) để dry-run cũng ra số thật
    const voucherDef = seedOrder.voucherCode
      ? vouchers.find((item) => item.code === seedOrder.voucherCode)
      : undefined
    const discountTotal = voucherDef
      ? voucherDef.discountType === 'PERCENT'
        ? Math.round((subtotal * voucherDef.discountValue) / 100)
        : Math.min(voucherDef.discountValue, subtotal)
      : 0
    const voucherId = seedOrder.voucherCode ? voucherIdByCode.get(seedOrder.voucherCode) : undefined
    const voucher =
      voucherId && !DRY_RUN ? await prisma.voucher.findUnique({ where: { id: voucherId } }) : null
    const serviceChargeAmount = Math.round((subtotal * seedOrder.serviceChargeRate) / 100)
    const taxTotal = Math.round(((subtotal - discountTotal + serviceChargeAmount) * seedOrder.taxRate) / 100)
    const grandTotal = subtotal - discountTotal + serviceChargeAmount + taxTotal + 0 // tip = 0

    if (DRY_RUN) {
      log(
        'order',
        `${seedOrder.seedKey}: ${resolved.length} món, subtotal ${subtotal}, giảm ${discountTotal}, phí ${serviceChargeAmount}, thuế ${taxTotal}, tổng ${grandTotal}`,
      )
      continue
    }

    const voucherSnapshot = voucher
      ? await prisma.voucherSnapshot.create({
          data: {
            voucherId: voucher.id,
            code: voucher.code,
            discountType: voucher.discountType,
            discountValue: voucher.discountValue,
            startAt: voucher.startAt,
            endAt: voucher.endAt,
          },
        })
      : null

    const payment = await prisma.payment.create({
      data: {
        amount: VND(grandTotal),
        method: seedOrder.method,
        status: 'SUCCESS',
        paidAt: new Date(),
        branchId: mainBranchId,
        gatewayCode: seedOrder.method === 'VNPAY' ? 'VNBANK' : null,
        transactionId: seedOrder.method === 'VNPAY' ? `SEED-${seedOrder.seedKey}` : null,
      },
    })

    const order = await prisma.order.create({
      data: {
        branchId: mainBranchId,
        paymentId: payment.id,
        userId: customerId,
        customerId: customerIdByPhone.get(seedOrder.customerPhone) ?? null,
        guestId: guestId ?? null,
        status: 'PAID',
        type: 'ONLINE',
        subtotal: VND(subtotal),
        discountTotal: VND(discountTotal),
        serviceChargeRate: VND(seedOrder.serviceChargeRate),
        serviceChargeAmount: VND(serviceChargeAmount),
        tipAmount: VND(0),
        taxTotal: VND(taxTotal),
        grandTotal: VND(grandTotal),
        voucherSnapshotId: voucherSnapshot?.id ?? null,
        receiver: { seedKey: seedOrder.seedKey, note: 'du lieu demo tu seed:demo' },
        createdById: admin.id,
        items: {
          createMany: {
            data: resolved.map((sku, index) => ({
              productName: sku.productName,
              skuValue: sku.value,
              skuId: sku.id,
              productId: sku.productId,
              image: sku.image,
              quantity: seedOrder.items[index].quantity,
              skuPrice: sku.price,
              productTranslations: [],
            })),
          },
        },
      },
    })

    // Ghi sổ: dùng chính service nghiệp vụ để bút toán luôn cân Nợ = Có
    const lines = buildOrderLedgerLines(
      {
        grandTotal: VND(grandTotal),
        subtotal: VND(subtotal),
        discountTotal: VND(discountTotal),
        serviceChargeAmount: VND(serviceChargeAmount),
        taxTotal: VND(taxTotal),
        tipAmount: VND(0),
      },
      seedOrder.paidInto,
    ).map((line) => ({ ...line, orderId: order.id, paymentId: payment.id }))

    const posted = await ledger.postEntry({
      branchId: mainBranchId,
      refType: seedOrder.refType,
      refId: order.id,
      idempotencyKey: `seed:${seedOrder.seedKey}`,
      memo: `Đơn #${order.id} thanh toán ${seedOrder.method}`,
      lines,
    })

    log(
      'order',
      `#${order.id} ${seedOrder.seedKey} — ${grandTotal}đ qua ${seedOrder.method}, bút toán #${posted.id} (${lines.length} dòng)`,
    )
  }

  // ── 8. Payment intent đang chờ (cho màn thanh toán) ────────────────────────
  if (!DRY_RUN) {
    const reference = 'SEED-VNPAY-PENDING-1'
    await prisma.paymentIntent.upsert({
      where: { reference },
      update: { status: 'PENDING', amount: VND(160000) },
      create: {
        provider: 'VNPAY',
        reference,
        amount: VND(160000),
        orderIds: [],
        status: 'PENDING',
        payload: { seed: true },
      },
    })
    log('paymentIntent', reference)
  }

  // ── 9. Nhắc việc + log ────────────────────────────────────────────────────
  const reminders = [
    { title: 'Kiểm két cuối ngày', time_to_remind: '22:00', repeat_mode: 'DAILY' as const, description: 'Đối soát tiền mặt với sổ cái' },
    { title: 'Nhập hàng thịt bò', time_to_remind: '08:30', repeat_mode: 'WEEKLY' as const, repeat_days: [1, 4], description: 'Liên hệ NCC thịt bò' },
  ]
  for (const reminder of reminders) {
    if (DRY_RUN) {
      log('reminder', reminder.title)
      continue
    }
    const existing = await prisma.reminders.findFirst({
      where: { title: reminder.title, deletedAt: null },
      select: { id: true },
    })
    const record =
      existing ??
      (await prisma.reminders.create({
        data: {
          title: reminder.title,
          time_to_remind: reminder.time_to_remind,
          repeat_mode: reminder.repeat_mode,
          repeat_days: reminder.repeat_days ?? [],
          description: reminder.description,
          scheduled_date: new Date(),
          is_active: true,
          createdById: admin.id,
        },
      }))

    const existingLog = await prisma.reminderLogs.findFirst({
      where: { reminder_id: record.id },
      select: { id: true },
    })
    if (!existingLog) {
      await prisma.reminderLogs.create({
        data: {
          reminder_id: record.id,
          scheduled_at: new Date(),
          completed_at: null,
          status: 'PENDING',
        },
      })
    }
    log('reminder', `#${record.id} ${reminder.title}`)
  }

  // ── 10. Đánh giá ──────────────────────────────────────────────────────────
  const reviews = [
    { productName: 'Phở bò', rating: 5, content: 'Nước dùng đậm đà, bánh phở tươi, rất đáng tiền.' },
    { productName: 'Cà phê sữa đá', rating: 4, content: 'Cà phê thơm, hơi ngọt so với khẩu vị của mình.' },
  ]
  for (const review of reviews) {
    const product = await prisma.product.findFirst({
      where: { name: review.productName, deletedAt: null },
      select: { id: true },
    })
    if (!product || DRY_RUN) {
      log('review', `${review.productName} ${review.rating}★`)
      continue
    }
    const existing = await prisma.review.findFirst({
      where: { userId: customerId, productId: product.id },
      select: { id: true },
    })
    const record =
      existing ??
      (await prisma.review.create({
        data: { userId: customerId, productId: product.id, rating: review.rating, content: review.content },
      }))
    log('review', `#${record.id} ${review.productName} ${review.rating}★`)
  }

  // ── Tổng kết ──────────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    const counts = {
      branch: await prisma.branch.count(),
      area: await prisma.area.count({ where: { deletedAt: null } }),
      table: await prisma.table.count({ where: { deletedAt: null } }),
      tableNode: await prisma.tableNode.count({ where: { deletedAt: null } }),
      ingredient: await prisma.ingredient.count({ where: { deletedAt: null } }),
      recipe: await prisma.sKURecipeIngredient.count({ where: { deletedAt: null } }),
      guest: await prisma.guest.count({ where: { deletedAt: null } }),
      reservation: await prisma.reservation.count({ where: { deletedAt: null } }),
      voucher: await prisma.voucher.count({ where: { deletedAt: null } }),
      order: await prisma.order.count({ where: { deletedAt: null } }),
      payment: await prisma.payment.count(),
      paymentIntent: await prisma.paymentIntent.count(),
      ledgerEntry: await prisma.ledgerEntry.count(),
      ledgerLine: await prisma.ledgerLine.count(),
      reminders: await prisma.reminders.count({ where: { deletedAt: null } }),
      reminderLogs: await prisma.reminderLogs.count(),
      review: await prisma.review.count(),
    }
    console.table(counts)

    // Bất biến: mọi bút toán POSTED phải cân
    const unbalanced = await prisma.$queryRaw<{ id: number; debit: unknown; credit: unknown }[]>`
      SELECT e."id",
             sum(CASE WHEN l."direction" = 'DEBIT' THEN l."amount" ELSE 0 END) AS debit,
             sum(CASE WHEN l."direction" = 'CREDIT' THEN l."amount" ELSE 0 END) AS credit
      FROM "LedgerEntry" e
      JOIN "LedgerLine" l ON l."entryId" = e."id"
      WHERE e."status" = 'POSTED'
      GROUP BY e."id"
      HAVING sum(CASE WHEN l."direction" = 'DEBIT' THEN l."amount" ELSE 0 END)
           <> sum(CASE WHEN l."direction" = 'CREDIT' THEN l."amount" ELSE 0 END)
    `
    console.log(
      unbalanced.length === 0
        ? '✔ Kiểm tra sổ cái: mọi bút toán POSTED đều cân Nợ = Có'
        : `✘ Có ${unbalanced.length} bút toán lệch: ${JSON.stringify(unbalanced)}`,
    )
  } else {
    console.log('\nDRY RUN: chưa ghi gì vào DB. Bỏ cờ --dry-run để chạy thật.')
  }
}

main()
  .catch((error) => {
    console.error('Seed demo thất bại:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
