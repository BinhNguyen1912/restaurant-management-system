import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

/**
 * Script CHỈ ĐỌC: dump dữ liệu đang có ra màn hình (tóm tắt) + file JSON đầy đủ.
 *
 * Chạy:  npm run db:dump
 *        npm run db:dump -- --out tmp/db-dump.json
 *        npm run db:dump -- --only=products       (products | orders | ledger | all)
 *
 * Không ghi gì vào DB, không gọi API — đọc thẳng Postgres qua Prisma.
 */

type Only = 'products' | 'orders' | 'ledger' | 'all'

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((arg) => arg.startsWith(`--${flag}=`))
  return hit?.slice(flag.length + 3)
}

const only = (argValue('only') as Only | undefined) ?? 'all'
const outPath = argValue('out') ?? join(process.cwd(), 'tmp', 'db-dump.json')

const money = (value: unknown) => Number(value ?? 0)

async function main() {
  const dump: Record<string, unknown> = {}

  const [counts] = await Promise.all([
    (async () => ({
      users: await prisma.user.count({ where: { deletedAt: null } }),
      branches: await prisma.branch.count(),
      categories: await prisma.category.count({ where: { deletedAt: null } }),
      products: await prisma.product.count({ where: { deletedAt: null } }),
      skus: await prisma.sKU.count({ where: { deletedAt: null } }),
      orders: await prisma.order.count({ where: { deletedAt: null } }),
      payments: await prisma.payment.count(),
      ledgerAccounts: await prisma.ledgerAccount.count(),
      ledgerEntries: await prisma.ledgerEntry.count(),
    }))(),
  ])
  dump.counts = counts
  console.log('=== Số bản ghi ===')
  console.table(counts)

  if (only === 'all' || only === 'products') {
    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        basePrice: true,
        virtualPrice: true,
        status: true,
        publishedAt: true,
        images: true,
        variants: true,
        categories: { select: { id: true, name: true } },
        productTranslations: { select: { languageId: true, name: true, description: true } },
        skus: {
          where: { deletedAt: null },
          select: { id: true, value: true, price: true, image: true, status: true },
        },
      },
    })
    dump.products = products

    console.log('\n=== Sản phẩm ===')
    console.table(
      products.map((product) => ({
        id: product.id,
        tên: product.name,
        giá: money(product.basePrice),
        'giá ảo': money(product.virtualPrice),
        'SKU': product.skus.length,
        'biến thể': Array.isArray(product.variants) ? (product.variants as unknown[]).length : 0,
        'danh mục': product.categories.map((category) => category.name).join(', ') || '—',
        'có bản dịch': product.productTranslations.length > 0 ? 'có' : 'KHÔNG',
        'có ảnh': product.images.length,
      })),
    )

    const missingTranslation = products.filter((product) => product.productTranslations.length === 0)
    if (missingTranslation.length > 0) {
      console.log(
        `\n⚠ ${missingTranslation.length} món chưa có bản dịch (productTranslations rỗng): ` +
          missingTranslation.map((product) => `#${product.id} ${product.name}`).join(', '),
      )
    }

    const badImage = products.filter((product) => product.images.some((image) => !/^https?:\/\//i.test(image)))
    if (badImage.length > 0) {
      console.log(
        `\n⚠ ${badImage.length} món có ảnh không phải URL http(s): ` +
          badImage.map((product) => `#${product.id} ${product.name}`).join(', '),
      )
    }

    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        _count: { select: { products: true } },
        categoryTranslations: { select: { languageId: true, name: true } },
      },
    })
    dump.categories = categories
    console.log('\n=== Danh mục ===')
    console.table(
      categories.map((category) => ({
        id: category.id,
        tên: category.name,
        'số món': category._count.products,
        'bản dịch': category.categoryTranslations.map((translation) => translation.languageId).join(', ') || '—',
      })),
    )
  }

  if (only === 'all' || only === 'orders') {
    const orders = await prisma.order.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        createdAt: true,
        subtotal: true,
        discountTotal: true,
        serviceChargeAmount: true,
        taxTotal: true,
        grandTotal: true,
        branchId: true,
        user: { select: { id: true, name: true } },
        guest: { select: { id: true, name: true } },
        payment: { select: { id: true, amount: true, method: true, status: true, paidAt: true } },
        items: { select: { id: true, productName: true, skuValue: true, quantity: true, skuPrice: true } },
      },
    })
    dump.orders = orders
    console.log('\n=== Đơn hàng (50 mới nhất) ===')
    console.table(
      orders.map((order) => ({
        id: order.id,
        trạng_thái: order.status,
        tổng: money(order.grandTotal),
        'thanh toán': order.payment ? `${order.payment.method ?? '—'}/${order.payment.status}` : 'chưa có',
        'số món': order.items.length,
        khách: order.user?.name ?? order.guest?.name ?? '—',
      })),
    )
  }

  if (only === 'all' || only === 'ledger') {
    const entries = await prisma.ledgerEntry.findMany({
      orderBy: { id: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        refType: true,
        refId: true,
        occurredAt: true,
        postedAt: true,
        lines: {
          select: { direction: true, amount: true, account: { select: { code: true, type: true } } },
        },
      },
    })
    dump.ledgerEntries = entries
    console.log('\n=== Bút toán sổ cái (50 mới nhất) ===')
    console.table(
      entries.map((entry) => ({
        id: entry.id,
        trạng_thái: entry.status,
        nghiệp_vụ: entry.refType,
        tham_chiếu: `${entry.refType}#${entry.refId}`,
        'tổng Nợ': entry.lines
          .filter((line) => line.direction === 'DEBIT')
          .reduce((sum, line) => sum + money(line.amount), 0),
        'tổng Có': entry.lines
          .filter((line) => line.direction === 'CREDIT')
          .reduce((sum, line) => sum + money(line.amount), 0),
      })),
    )

    const lines = await prisma.ledgerLine.findMany({
      where: { entry: { status: 'POSTED' } },
      select: { direction: true, amount: true, account: { select: { code: true } } },
    })
    const balances = new Map<string, { debit: number; credit: number }>()
    for (const line of lines) {
      const code = line.account.code
      const row = balances.get(code) ?? { debit: 0, credit: 0 }
      if (line.direction === 'DEBIT') row.debit += money(line.amount)
      else row.credit += money(line.amount)
      balances.set(code, row)
    }
    dump.trialBalance = [...balances.entries()].map(([accountCode, row]) => ({
      accountCode,
      debit: row.debit,
      credit: row.credit,
      balance: row.debit - row.credit,
    }))
    console.log('\n=== Cân đối phát sinh (chỉ bút toán POSTED) ===')
    console.table(dump.trialBalance)
  }

  const { mkdirSync } = await import('fs')
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true })
  writeFileSync(outPath, JSON.stringify(dump, null, 2), 'utf8')
  console.log(`\nĐã ghi JSON đầy đủ: ${outPath}`)
}

main()
  .catch((error) => {
    console.error('Dump thất bại:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
