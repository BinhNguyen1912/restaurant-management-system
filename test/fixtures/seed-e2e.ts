import { PrismaClient } from '@prisma/client'

/**
 * Dữ liệu nền TỐI THIỂU để e2e chạy được trên DB trống (CI).
 *
 * Vì sao cần: e2e giả định đã có chi nhánh, khu vực, bàn — trên máy dev những thứ đó có sẵn từ
 * `seed:demo`, nên test "xanh ở máy, đỏ trên CI". Fixture này tạo đúng phần nền đó và **chỉ phần
 * đó**: không tạo đơn, không ghi sổ cái, không tạo dữ liệu demo (khác hẳn `seed:demo`).
 *
 * Idempotent: chạy lại nhiều lần không tạo trùng.
 */
const prisma = new PrismaClient()

const TABLE_COUNT = 6

async function main() {
  const admin = await prisma.user.findFirst({ where: { deletedAt: null }, orderBy: { id: 'asc' }, select: { id: true } })
  if (!admin) throw new Error('Chưa có user nào — chạy `npm run deploy:prepare` trước')

  // 1. Chi nhánh
  const branch = await prisma.branch.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: { code: 'MAIN', name: 'Chi nhánh chính', address: '', isActive: true },
  })
  console.log(`chi nhánh: #${branch.id} ${branch.name}`)

  // 2. Khu vực (e2e tạo bàn cần areaId; bàn cần branchId)
  let area = await prisma.area.findFirst({ where: { branchId: branch.id, deletedAt: null }, orderBy: { id: 'asc' } })
  if (!area) {
    area = await prisma.area.create({
      data: { name: 'Khu vực e2e', branchId: branch.id, createdById: admin.id, isActive: true },
    })
  }
  console.log(`khu vực: #${area.id} ${area.name}`)

  // 3. Bàn (TableNode) — e2e cần bàn để mở/đóng, gắn khách
  const existing = await prisma.tableNode.count({ where: { branchId: branch.id, deletedAt: null } })
  for (let index = existing; index < TABLE_COUNT; index += 1) {
    await prisma.tableNode.create({
      data: {
        name: `Bàn e2e ${index + 1}`,
        seats: 4,
        type: 'TABLE',
        status: 'AVAILABLE',
        positionX: index * 80,
        positionY: 0,
        width: 60,
        height: 60,
        imageUrl: '',
        areaId: area.id,
        branchId: branch.id,
        createdById: admin.id,
        token: `e2e${Date.now()}${index}${Math.round(Math.random() * 1000)}`,
      },
    })
  }
  console.log(`bàn của chi nhánh: ${await prisma.tableNode.count({ where: { branchId: branch.id, deletedAt: null } })}`)
}

main()
  .catch((error) => {
    console.error('Seed fixture e2e thất bại:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
